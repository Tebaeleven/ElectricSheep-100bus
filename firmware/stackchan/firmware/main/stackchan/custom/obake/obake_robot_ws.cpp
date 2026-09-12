/*
 * Robot / Media WebSocket。
 * サーバ経路: 内部 DRAM 逼迫を避けるため SPIRAM スタック・Wi-Fi 後遅延・httpd 再試行上限 3。
 * クライアント経路: 既存の PC server.py 上行（4 バイト長プレフィクス）を残す。
 */
#include "obake_robot_ws.h"

#include "obake_config.h"
#include "obake_servo_api.h"

#include <hal/board/cores3_audio_codec.h>
#include <hal/hal.h>

#include <algorithm>
#include <atomic>
#include <cstring>
#include <deque>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include <ArduinoJson.hpp>
#include <audio/audio_codec.h>
#include <board.h>
#include <esp_heap_caps.h>
#include <esp_http_server.h>
#include <esp_log.h>
#include <esp_memory_utils.h>
#include <esp_netif.h>
#include <esp_timer.h>
#include <esp_wifi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/idf_additions.h>
#include <freertos/task.h>
#include <hal/board/hal_bridge.h>
#include <jpg/image_to_jpeg.h>
#include <mdns.h>
#include <web_socket.h>
#include <wifi_manager.h>

namespace stackchan::obake {
namespace {

const char* TAG = "obake_robot_ws";

/** 内部 DRAM（~数百 KB）と 8MB PSRAM を分けて出す。free sram≈3KB は内部枯渇であり PSRAM 未搭載ではない */
void LogHeaps(const char* where)
{
    ESP_LOGI(TAG, "%s heap internal=%u spiram=%u (min_int=%u)", where,
             static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)),
             static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)),
             static_cast<unsigned>(heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)));
}

uint32_t now_ms()
{
    return static_cast<uint32_t>(esp_timer_get_time() / 1000ULL);
}

int PcmRate()
{
    auto* codec = Board::GetInstance().GetAudioCodec();
    return codec ? codec->input_sample_rate() : 24000;
}

/** JPEG エンコード一時領域が内部 DRAM を食い潰さないよう、余裕が無いときは撮らない */
constexpr size_t kMinInternalForJpegEncode = 24 * 1024;

/** JPEG は SPIRAM 側へ寄せる（内部 DRAM に大きなフレームを置かない） */
bool CaptureJpeg(uint8_t** out_jpeg, size_t* out_len)
{
    *out_jpeg = nullptr;
    *out_len = 0;
    LogHeaps("before CaptureJpeg");
    const size_t internal_free = heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    if (internal_free < kMinInternalForJpegEncode) {
        // 8MB PSRAM が空いていても jpeg_calloc_align 等が内部を要求するため、ここで拒否して固まりを防ぐ
        ESP_LOGW(TAG, "skip CaptureJpeg: internal DRAM %u < %u (spiram=%u still free)",
                 static_cast<unsigned>(internal_free), static_cast<unsigned>(kMinInternalForJpegEncode),
                 static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)));
        return false;
    }
    auto* camera = hal_bridge::board_get_camera();
    if (camera == nullptr || !camera->StreamCaptures()) {
        LogHeaps("CaptureJpeg stream fail");
        return false;
    }
    uint8_t* jpeg = nullptr;
    size_t jpeg_len = 0;
    if (!image_to_jpeg(const_cast<uint8_t*>(camera->GetFrameData()), camera->GetFrameSize(), camera->GetFrameWidth(),
                       camera->GetFrameHeight(), static_cast<v4l2_pix_fmt_t>(camera->GetFrameFormat()),
                       kMediaJpegQuality, &jpeg, &jpeg_len) ||
        jpeg == nullptr || jpeg_len == 0) {
        LogHeaps("CaptureJpeg encode fail");
        return false;
    }
    // エンコーダ出力が内部 DRAM に載った場合は SPIRAM へ移し、内部を即座に返す
    if (!esp_ptr_external_ram(jpeg)) {
        uint8_t* spiram_copy =
            static_cast<uint8_t*>(heap_caps_malloc(jpeg_len, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
        if (spiram_copy == nullptr) {
            ESP_LOGW(TAG, "SPIRAM copy failed for jpeg %u", static_cast<unsigned>(jpeg_len));
            free(jpeg);
            LogHeaps("after CaptureJpeg spiram-copy fail");
            return false;
        }
        memcpy(spiram_copy, jpeg, jpeg_len);
        free(jpeg);
        jpeg = spiram_copy;
    }
    *out_jpeg = jpeg;
    *out_len = jpeg_len;
    LogHeaps("after CaptureJpeg");
    return true;
}

/** マイクは Xiaozhi Read の tee のみ（直 InputData は無音になりやすい） */
bool CopyMicMono(std::vector<int16_t>& mono)
{
    std::vector<int16_t> chunk;
    int channels = 1;
    if (!ObakeCopyLastMicInput(chunk, &channels) || chunk.empty()) {
        return false;
    }
    channels = std::max(channels, 1);
    const size_t frames = chunk.size() / static_cast<size_t>(channels);
    if (frames == 0) {
        return false;
    }
    mono.resize(frames);
    for (size_t i = 0; i < frames; ++i) {
        mono[i] = chunk[i * static_cast<size_t>(channels)];
    }
    return true;
}

std::atomic<bool> s_run{false};
TaskHandle_t s_task = nullptr;

// -----------------------------------------------------------------------------
// クライアント経路（kMediaListenAsServer=0）— PC server.py 向け
// -----------------------------------------------------------------------------

enum class ClientBinType : uint8_t {
    Jpeg = 0x02,
    Pcm = 0x20,
};

std::mutex s_ws_mu;
std::unique_ptr<WebSocket> s_ws;
std::atomic<bool> s_connected{false};

const char* ConnectHost()
{
    if (kMediaWsLanIp != nullptr && kMediaWsLanIp[0] != '\0') {
        return kMediaWsLanIp;
    }
    return kMediaWsHost;
}

std::string BuildClientUrl()
{
    char buf[192];
    snprintf(buf, sizeof(buf), "ws://%s:%d%s", ConnectHost(), kMediaWsPort, kMediaWsPath);
    return std::string(buf);
}

bool SendFramed(WebSocket* ws, ClientBinType type, const uint8_t* payload, size_t len)
{
    if (ws == nullptr || !ws->IsConnected()) {
        return false;
    }
    // PC サーバ互換: [type:1][len:4 BE][payload]
    std::vector<uint8_t> buf(5 + len);
    buf[0] = static_cast<uint8_t>(type);
    buf[1] = static_cast<uint8_t>((len >> 24) & 0xff);
    buf[2] = static_cast<uint8_t>((len >> 16) & 0xff);
    buf[3] = static_cast<uint8_t>((len >> 8) & 0xff);
    buf[4] = static_cast<uint8_t>(len & 0xff);
    if (len > 0 && payload != nullptr) {
        memcpy(buf.data() + 5, payload, len);
    }
    return ws->Send(buf.data(), buf.size(), true);
}

void HandleServerText(const char* data, size_t len)
{
    ArduinoJson::JsonDocument doc;
    if (ArduinoJson::deserializeJson(doc, data, len)) {
        return;
    }
    const char* cmd = doc["cmd"] | "";
    if (strcmp(cmd, "set_head") == 0) {
        const int yaw = doc["yaw"] | 0;
        const int pitch = doc["pitch"] | 0;
        const int speed = doc["speed"] | 150;
        ServoRequestSetHeadAngles(yaw, pitch, speed);
        ESP_LOGI(TAG, "set_head yaw=%d pitch=%d speed=%d", yaw, pitch, speed);
    }
}

bool CaptureAndSendJpegClient(WebSocket* ws)
{
    uint8_t* jpeg = nullptr;
    size_t jpeg_len = 0;
    if (!CaptureJpeg(&jpeg, &jpeg_len)) {
        return false;
    }
    const bool ok = SendFramed(ws, ClientBinType::Jpeg, jpeg, jpeg_len);
    heap_caps_free(jpeg);
    return ok;
}

bool CaptureAndSendPcmClient(WebSocket* ws)
{
    std::vector<int16_t> mono;
    if (!CopyMicMono(mono)) {
        return false;
    }
    return SendFramed(ws, ClientBinType::Pcm, reinterpret_cast<const uint8_t*>(mono.data()),
                      mono.size() * sizeof(int16_t));
}

bool ConnectOnce()
{
    auto& board = Board::GetInstance();
    auto network = board.GetNetwork();
    if (!network) {
        ESP_LOGW(TAG, "no network yet");
        return false;
    }

    esp_err_t ps_err = esp_wifi_set_ps(WIFI_PS_NONE);
    if (ps_err != ESP_OK) {
        ESP_LOGW(TAG, "wifi PS_NONE failed: %s", esp_err_to_name(ps_err));
    }

    auto ws = network->CreateWebSocket(2);
    if (!ws) {
        ESP_LOGE(TAG, "CreateWebSocket failed");
        return false;
    }
    ws->SetReceiveBufferSize(4096);

    ws->OnConnected([]() {
        ESP_LOGI(TAG, "client connected");
        s_connected.store(true);
    });
    ws->OnDisconnected([]() {
        ESP_LOGW(TAG, "client disconnected");
        s_connected.store(false);
    });
    ws->OnError([](int err) {
        ESP_LOGW(TAG, "ws error %d", err);
        s_connected.store(false);
    });
    ws->OnData([](const char* data, size_t len, bool binary) {
        if (!binary && data != nullptr && len > 0) {
            HandleServerText(data, len);
        }
    });

    ESP_LOGI(TAG, "connecting ws://%s:%d%s", kMediaWsHost, kMediaWsPort, kMediaWsPath);
    if (ConnectHost() != kMediaWsHost) {
        ESP_LOGI(TAG, "resolve %s -> %s (firmware LAN map)", kMediaWsHost, ConnectHost());
    }
    const std::string url = BuildClientUrl();
    if (!ws->Connect(url.c_str())) {
        ESP_LOGW(TAG, "connect failed (check LAN map / dns_responder / server / firewall)");
        return false;
    }

    char hello[96];
    snprintf(hello, sizeof(hello), "{\"type\":\"hello\",\"pcm_rate\":%d}", PcmRate());
    ws->Send(std::string(hello));

    {
        std::lock_guard<std::mutex> lock(s_ws_mu);
        s_ws = std::move(ws);
    }
    return true;
}

void DisconnectClient()
{
    std::lock_guard<std::mutex> lock(s_ws_mu);
    if (s_ws) {
        s_ws->Close();
        s_ws.reset();
    }
    s_connected.store(false);
}

void MediaClientTask(void* /*arg*/)
{
    ESP_LOGI(TAG, "media client task (host=%s lan_ip=%s)", kMediaWsHost,
             (kMediaWsLanIp && kMediaWsLanIp[0]) ? kMediaWsLanIp : "(dns)");
    vTaskDelay(pdMS_TO_TICKS(3000));

    uint32_t last_jpeg_try_ms = 0;
    uint32_t last_pcm_ms = 0;
    uint32_t last_jpeg_ok_ms = now_ms();
    uint32_t jpeg_fail_streak = 0;
    while (s_run.load()) {
        if (!WifiManager::GetInstance().IsConnected()) {
            ESP_LOGW(TAG, "waiting wifi...");
            DisconnectClient();
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        if (!s_connected.load() || s_ws == nullptr || !s_ws->IsConnected()) {
            DisconnectClient();
            if (!ConnectOnce()) {
                vTaskDelay(pdMS_TO_TICKS(kMediaReconnectMs));
                continue;
            }
            last_jpeg_ok_ms = now_ms();
            jpeg_fail_streak = 0;
        }

        WebSocket* ws = nullptr;
        {
            std::lock_guard<std::mutex> lock(s_ws_mu);
            ws = s_ws.get();
        }
        if (ws == nullptr) {
            vTaskDelay(pdMS_TO_TICKS(200));
            continue;
        }

        const uint32_t t = now_ms();
        if (t - last_jpeg_ok_ms >= kMediaJpegStallMs) {
            ESP_LOGW(TAG, "jpeg stall %lu ms — reconnect", static_cast<unsigned long>(t - last_jpeg_ok_ms));
            DisconnectClient();
            vTaskDelay(pdMS_TO_TICKS(200));
            continue;
        }

        if (t - last_jpeg_try_ms >= kMediaJpegIntervalMs) {
            last_jpeg_try_ms = t;
            if (CaptureAndSendJpegClient(ws)) {
                last_jpeg_ok_ms = t;
                jpeg_fail_streak = 0;
            } else {
                jpeg_fail_streak++;
                if ((jpeg_fail_streak % 5U) == 1U) {
                    ESP_LOGW(TAG, "jpeg capture/send failed (streak=%lu)",
                             static_cast<unsigned long>(jpeg_fail_streak));
                }
            }
        }
        if (t - last_pcm_ms >= kMediaPcmIntervalMs) {
            last_pcm_ms = t;
            CaptureAndSendPcmClient(ws);
        }
        vTaskDelay(pdMS_TO_TICKS(20));
    }

    DisconnectClient();
    s_task = nullptr;
    vTaskDelete(nullptr);
}

// -----------------------------------------------------------------------------
// サーバ経路（kMediaListenAsServer=1）— Next.js / client_test.py
// バイナリは長さプレフィクス無し: 0x02+JPEG / 0x01+PCM
// -----------------------------------------------------------------------------

/** 双方向契約: 0x01=PCM（現状は上行。下り再生は将来別経路でも型を衝突させない） / 0x02=JPEG */
enum class ServerBinType : uint8_t {
    Pcm = 0x01,
    Jpeg = 0x02,
};

std::mutex s_httpd_mu;
httpd_handle_t s_httpd = nullptr;
std::atomic<int> s_client_fd{-1};
std::atomic<bool> s_audio{false};
std::atomic<bool> s_mdns_ok{false};
/** httpd ハンドラ内で JPEG エンコードしない（SPIRAM タスク側へ延期して固まり・OOM を避ける） */
std::atomic<int> s_capture_pending_fd{-1};

/** ブラウザ／POST からの LED・手指令。httpd タスクでは I2C/サーボせずキューのみ */
enum class ControlCmd : uint8_t {
    LedOn,
    LedOff,
    HandOpen,
    HandClose,
};

std::mutex s_ctrl_mu;
std::deque<ControlCmd> s_ctrl_queue;

void ControlRequestEnqueue(ControlCmd cmd)
{
    std::lock_guard<std::mutex> lock(s_ctrl_mu);
    // 同種の連続指令は最新だけ残す（連打で遅延蓄積しない）
    while (!s_ctrl_queue.empty() && s_ctrl_queue.back() == cmd) {
        s_ctrl_queue.pop_back();
    }
    s_ctrl_queue.push_back(cmd);
}

/** PreUpdate: LED は HAL、手は ServoRequest へ（その後 ServoApiDrain） */
void ControlApiDrain()
{
    std::deque<ControlCmd> local;
    {
        std::lock_guard<std::mutex> lock(s_ctrl_mu);
        local.swap(s_ctrl_queue);
    }
    for (const ControlCmd cmd : local) {
        switch (cmd) {
            case ControlCmd::LedOn:
                // ウェイク LISTENING と同じ緑（index0）
                GetHAL().setRgbColor(0, 0, 50, 0);
                GetHAL().refreshRgb();
                ESP_LOGI(TAG, "control drain led_on");
                break;
            case ControlCmd::LedOff:
                // STANDBY と同じ消灯
                GetHAL().setRgbColor(0, 0, 0, 0);
                GetHAL().refreshRgb();
                ESP_LOGI(TAG, "control drain led_off");
                break;
            case ControlCmd::HandOpen:
            case ControlCmd::HandClose: {
                // pitch 維持はドレイン側で読む（httpd から Motion に触らない）
                int cur_yaw = 0;
                int cur_pitch = 0;
                ServoGetHeadAngles(cur_yaw, cur_pitch);
                const bool open = (cmd == ControlCmd::HandOpen);
                const int yaw = open ? kHandOpenYawDeg : kHandCloseYawDeg;
                ServoRequestSetHeadAngles(yaw, cur_pitch, kHandYawSpeed);
                ESP_LOGI(TAG, "control drain hand open=%d yaw=%d pitch=%d", open ? 1 : 0, yaw, cur_pitch);
                break;
            }
        }
    }
}

/** ブラウザ用の最小 HTML（4ボタン）。見た目は問わない */
static const char kControlHtml[] =
    "<!DOCTYPE html><html><head><meta charset=utf-8>"
    "<meta name=viewport content=\"width=device-width,initial-scale=1\">"
    "<title>Obake</title></head><body>"
    "<h1>Obake</h1>"
    "<p><button onclick=\"p(this,'/obake/led_on')\">光る</button></p>"
    "<p><button onclick=\"p(this,'/obake/led_off')\">消す</button></p>"
    "<p><button onclick=\"p(this,'/obake/hand_open')\">開く</button></p>"
    "<p><button onclick=\"p(this,'/obake/hand_close')\">閉じる</button></p>"
    "<pre id=o></pre>"
    "<script>"
    "async function p(btn,u){"
    "const o=document.getElementById('o');"
    "btn.disabled=true;"
    "try{"
    "for(let i=0;i<2;i++){"
    "try{"
    "const r=await fetch(u,{method:'POST',cache:'no-store'});"
    "const t=await r.text();"
    "o.textContent=u+' '+r.status+' '+t;"
    "if(r.ok)return;"
    "}catch(e){o.textContent=String(e);if(i)return;}"
    "}"
    "}finally{btn.disabled=false;}"
    "}"
    "</script>"
    "</body></html>";

/** 常に JSON で ok/error を返す（フロントの判定を簡単にする） */
esp_err_t SendJsonResult(httpd_req_t* req, bool ok, const char* action, const char* err = nullptr)
{
    char buf[160];
    if (ok) {
        snprintf(buf, sizeof(buf), "{\"ok\":true,\"action\":\"%s\"}", action);
    } else {
        snprintf(buf, sizeof(buf), "{\"ok\":false,\"action\":\"%s\",\"error\":\"%s\"}", action,
                 err != nullptr ? err : "failed");
    }
    httpd_resp_set_type(req, "application/json; charset=utf-8");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    return httpd_resp_send(req, buf, HTTPD_RESP_USE_STRLEN);
}

esp_err_t ControlPageHandler(httpd_req_t* req)
{
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    return httpd_resp_send(req, kControlHtml, HTTPD_RESP_USE_STRLEN);
}

esp_err_t LedOnHandler(httpd_req_t* req)
{
    ControlRequestEnqueue(ControlCmd::LedOn);
    return SendJsonResult(req, true, "led_on");
}

esp_err_t LedOffHandler(httpd_req_t* req)
{
    ControlRequestEnqueue(ControlCmd::LedOff);
    return SendJsonResult(req, true, "led_off");
}

esp_err_t HandOpenHandler(httpd_req_t* req)
{
    ControlRequestEnqueue(ControlCmd::HandOpen);
    return SendJsonResult(req, true, "hand_open");
}

esp_err_t HandCloseHandler(httpd_req_t* req)
{
    ControlRequestEnqueue(ControlCmd::HandClose);
    return SendJsonResult(req, true, "hand_close");
}

void LogStaIp()
{
    esp_netif_t* netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    if (netif == nullptr) {
        ESP_LOGW(TAG, "STA netif missing");
        return;
    }
    esp_netif_ip_info_t ip{};
    if (esp_netif_get_ip_info(netif, &ip) != ESP_OK) {
        ESP_LOGW(TAG, "STA IP read failed");
        return;
    }
    ESP_LOGI(TAG, "STA IP " IPSTR "  http://%s.local:%d/  ws://" IPSTR ":%d%s", IP2STR(&ip.ip), kRobotWsMdnsHost,
             kRobotWsPort, IP2STR(&ip.ip), kRobotWsPort, kRobotWsPath);
}

void StartMdns()
{
    if (s_mdns_ok.load()) {
        return;
    }
    esp_err_t err = mdns_init();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGW(TAG, "mdns_init: %s", esp_err_to_name(err));
        return;
    }
    err = mdns_hostname_set(kRobotWsMdnsHost);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "mdns hostname: %s", esp_err_to_name(err));
        return;
    }
    mdns_instance_name_set("Obake Robot");
    mdns_service_add(nullptr, "_http", "_tcp", static_cast<uint16_t>(kRobotWsPort), nullptr, 0);
    s_mdns_ok.store(true);
    ESP_LOGI(TAG, "mDNS %s.local", kRobotWsMdnsHost);
}

void StopMdns()
{
    if (!s_mdns_ok.exchange(false)) {
        return;
    }
    mdns_free();
}

esp_err_t SendWsText(httpd_req_t* req, const char* json)
{
    httpd_ws_frame_t frame{};
    frame.type = HTTPD_WS_TYPE_TEXT;
    frame.payload = reinterpret_cast<uint8_t*>(const_cast<char*>(json));
    frame.len = strlen(json);
    return httpd_ws_send_frame(req, &frame);
}

/** req 無し（延期キャプチャ失敗など）でも FD 経由で JSON を返す */
esp_err_t SendWsTextFd(int fd, const char* json)
{
    httpd_handle_t hd = nullptr;
    {
        std::lock_guard<std::mutex> lock(s_httpd_mu);
        hd = s_httpd;
    }
    if (hd == nullptr || fd < 0 || json == nullptr) {
        return ESP_FAIL;
    }
    httpd_ws_frame_t frame{};
    frame.type = HTTPD_WS_TYPE_TEXT;
    frame.payload = reinterpret_cast<uint8_t*>(const_cast<char*>(json));
    frame.len = strlen(json);
    return httpd_ws_send_data(hd, fd, &frame);
}

esp_err_t SendWsBinFd(int fd, ServerBinType type, const uint8_t* payload, size_t len)
{
    httpd_handle_t hd = nullptr;
    {
        std::lock_guard<std::mutex> lock(s_httpd_mu);
        hd = s_httpd;
    }
    if (hd == nullptr || fd < 0) {
        return ESP_FAIL;
    }
    // 先頭 1 バイトが種別。長さプレフィクスは付けない（PC クライアント経路と違う）
    uint8_t* buf = static_cast<uint8_t*>(heap_caps_malloc(1 + len, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (buf == nullptr) {
        ESP_LOGW(TAG, "SPIRAM alloc failed for ws bin %u", static_cast<unsigned>(1 + len));
        return ESP_ERR_NO_MEM;
    }
    buf[0] = static_cast<uint8_t>(type);
    if (len > 0 && payload != nullptr) {
        memcpy(buf + 1, payload, len);
    }
    httpd_ws_frame_t frame{};
    frame.type = HTTPD_WS_TYPE_BINARY;
    frame.payload = buf;
    frame.len = 1 + len;
    // send_data は呼び出し元スレッドで完了する。async+即 free は UAF になる
    const esp_err_t err = httpd_ws_send_data(hd, fd, &frame);
    heap_caps_free(buf);
    return err;
}

void SendAck(httpd_req_t* req, const char* cmd)
{
    char buf[96];
    snprintf(buf, sizeof(buf), "{\"type\":\"ack\",\"cmd\":\"%s\"}", cmd);
    SendWsText(req, buf);
}

void SendErr(httpd_req_t* req, const char* cmd, const char* message)
{
    char buf[160];
    snprintf(buf, sizeof(buf), "{\"type\":\"error\",\"cmd\":\"%s\",\"message\":\"%s\"}", cmd, message);
    SendWsText(req, buf);
}

void SendErrFd(int fd, const char* cmd, const char* message)
{
    char buf[160];
    snprintf(buf, sizeof(buf), "{\"type\":\"error\",\"cmd\":\"%s\",\"message\":\"%s\"}", cmd, message);
    SendWsTextFd(fd, buf);
}

void OnClientClosed(httpd_handle_t /*hd*/, int sockfd)
{
    // 切断時に FD を捨て、音声上行と延期キャプチャを止める（リークした listen と混同しない）
    int expected = sockfd;
    if (s_client_fd.compare_exchange_strong(expected, -1)) {
        s_audio.store(false);
        int pend = sockfd;
        s_capture_pending_fd.compare_exchange_strong(pend, -1);
        ESP_LOGI(TAG, "ws client closed fd=%d", sockfd);
    }
}

bool SendCameraFrame(int fd)
{
    uint8_t* jpeg = nullptr;
    size_t jpeg_len = 0;
    if (!CaptureJpeg(&jpeg, &jpeg_len)) {
        return false;
    }
    const esp_err_t err = SendWsBinFd(fd, ServerBinType::Jpeg, jpeg, jpeg_len);
    heap_caps_free(jpeg);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "jpeg send: %s", esp_err_to_name(err));
        return false;
    }
    return true;
}

/** ServerTask から呼ぶ: 延期された camera.capture を1枚処理 */
void PumpPendingCapture()
{
    const int fd = s_capture_pending_fd.exchange(-1);
    if (fd < 0) {
        return;
    }
    if (s_client_fd.load() != fd) {
        ESP_LOGW(TAG, "drop stale capture fd=%d", fd);
        return;
    }
    if (!SendCameraFrame(fd)) {
        SendErrFd(fd, "camera.capture", "capture_failed");
    }
}

void HandleRobotJson(httpd_req_t* req, int fd, const char* data, size_t len)
{
    ArduinoJson::JsonDocument doc;
    if (ArduinoJson::deserializeJson(doc, data, len)) {
        SendErr(req, "?", "bad_json");
        return;
    }
    const char* type = doc["type"] | "";
    if (strcmp(type, "hand.set") == 0) {
        // グリッパ無し: open/close を首 yaw 左右にマップ（定数は obake_config.h）
        // 先に ack。実処理は PreUpdate の ControlApiDrain（httpd から Motion/I2C しない）
        SendAck(req, "hand.set");
        ControlRequestEnqueue((doc["open"] | false) ? ControlCmd::HandOpen : ControlCmd::HandClose);
        return;
    }
    if (strcmp(type, "camera.capture") == 0) {
        // ack だけ即返し、JPEG は ServerTask（SPIRAM スタック）で撮る
        SendAck(req, "camera.capture");
        s_capture_pending_fd.store(fd);
        return;
    }
    if (strcmp(type, "audio.start") == 0) {
        s_audio.store(true);
        SendAck(req, "audio.start");
        return;
    }
    if (strcmp(type, "audio.stop") == 0) {
        s_audio.store(false);
        SendAck(req, "audio.stop");
        return;
    }
    SendErr(req, type[0] ? type : "?", "unknown_cmd");
}

esp_err_t WsHandler(httpd_req_t* req)
{
    const int fd = httpd_req_to_sockfd(req);
    if (req->method == HTTP_GET) {
        // 同時接続は 1。既存がいれば新規を閉じる（ソケット浪費防止）
        int cur = s_client_fd.load();
        if (cur >= 0 && cur != fd) {
            ESP_LOGW(TAG, "reject extra client fd=%d (have %d)", fd, cur);
            return ESP_FAIL;
        }
        s_client_fd.store(fd);
        s_audio.store(false);
        ESP_LOGI(TAG, "ws handshake fd=%d", fd);
        char hello[96];
        snprintf(hello, sizeof(hello), "{\"type\":\"hello\",\"pcm_rate\":%d}", PcmRate());
        SendWsText(req, hello);
        return ESP_OK;
    }

    httpd_ws_frame_t pkt{};
    pkt.type = HTTPD_WS_TYPE_TEXT;
    esp_err_t ret = httpd_ws_recv_frame(req, &pkt, 0);
    if (ret != ESP_OK) {
        return ret;
    }
    if (pkt.type == HTTPD_WS_TYPE_CLOSE) {
        OnClientClosed(req->handle, fd);
        return ESP_OK;
    }
    if (pkt.len == 0 || pkt.type != HTTPD_WS_TYPE_TEXT) {
        return ESP_OK;
    }
    uint8_t* buf = static_cast<uint8_t*>(heap_caps_malloc(pkt.len + 1, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (buf == nullptr) {
        return ESP_ERR_NO_MEM;
    }
    pkt.payload = buf;
    ret = httpd_ws_recv_frame(req, &pkt, pkt.len);
    if (ret == ESP_OK) {
        buf[pkt.len] = 0;
        HandleRobotJson(req, fd, reinterpret_cast<char*>(buf), pkt.len);
    }
    heap_caps_free(buf);
    return ret;
}

void PumpAudioIfNeeded()
{
    if (!s_audio.load()) {
        return;
    }
    const int fd = s_client_fd.load();
    if (fd < 0) {
        return;
    }
    std::vector<int16_t> mono;
    if (!CopyMicMono(mono)) {
        return;
    }
    const esp_err_t err =
        SendWsBinFd(fd, ServerBinType::Pcm, reinterpret_cast<const uint8_t*>(mono.data()), mono.size() * sizeof(int16_t));
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "pcm send: %s", esp_err_to_name(err));
    }
}

void StopHttpdLocked()
{
    if (s_httpd == nullptr) {
        return;
    }
    // 失敗リトライ前に必ず stop して listen FD を返す（errno 112 対策）
    httpd_stop(s_httpd);
    s_httpd = nullptr;
    s_client_fd.store(-1);
    s_audio.store(false);
    s_capture_pending_fd.store(-1);
}

bool StartHttpdOnce()
{
    StopHttpdLocked();

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = static_cast<uint16_t>(kRobotWsPort);
    // WS + ブラウザ keep-alive + 連打 POST で 4 だと枯渇しやすい
    config.max_open_sockets = 7;
    // WS + GET / /control + POST led_on/off hand_open/close
    config.max_uri_handlers = 10;
    config.backlog_conn = 2;
    config.lru_purge_enable = true;
    // 内部 DRAM の httpd タスクを避け、SPIRAM 上の小さめスタックで動かす
    config.stack_size = 6144;
    config.core_id = 0;
    config.task_caps = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
    config.close_fn = OnClientClosed;

    LogHeaps("before httpd_start");
    httpd_handle_t hd = nullptr;
    esp_err_t err = httpd_start(&hd, &config);
    LogHeaps("after httpd_start");
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "httpd_start failed err=0x%x (%s)", static_cast<unsigned>(err), esp_err_to_name(err));
        if (hd != nullptr) {
            httpd_stop(hd);
        }
        s_httpd = nullptr;
        return false;
    }

    static const httpd_uri_t kWsUri = {
        .uri = kRobotWsPath,
        .method = HTTP_GET,
        .handler = WsHandler,
        .user_ctx = nullptr,
        .is_websocket = true,
        .handle_ws_control_frames = false,
        .supported_subprotocol = nullptr,
    };
    // ブラウザ用: GET / と /control は同じ最小 HTML
    static const httpd_uri_t kRootUri = {
        .uri = "/",
        .method = HTTP_GET,
        .handler = ControlPageHandler,
        .user_ctx = nullptr,
        .is_websocket = false,
        .handle_ws_control_frames = false,
        .supported_subprotocol = nullptr,
    };
    static const httpd_uri_t kControlUri = {
        .uri = "/control",
        .method = HTTP_GET,
        .handler = ControlPageHandler,
        .user_ctx = nullptr,
        .is_websocket = false,
        .handle_ws_control_frames = false,
        .supported_subprotocol = nullptr,
    };
    static const httpd_uri_t kLedOnUri = {
        .uri = "/obake/led_on",
        .method = HTTP_POST,
        .handler = LedOnHandler,
        .user_ctx = nullptr,
        .is_websocket = false,
        .handle_ws_control_frames = false,
        .supported_subprotocol = nullptr,
    };
    static const httpd_uri_t kLedOffUri = {
        .uri = "/obake/led_off",
        .method = HTTP_POST,
        .handler = LedOffHandler,
        .user_ctx = nullptr,
        .is_websocket = false,
        .handle_ws_control_frames = false,
        .supported_subprotocol = nullptr,
    };
    static const httpd_uri_t kHandOpenUri = {
        .uri = "/obake/hand_open",
        .method = HTTP_POST,
        .handler = HandOpenHandler,
        .user_ctx = nullptr,
        .is_websocket = false,
        .handle_ws_control_frames = false,
        .supported_subprotocol = nullptr,
    };
    static const httpd_uri_t kHandCloseUri = {
        .uri = "/obake/hand_close",
        .method = HTTP_POST,
        .handler = HandCloseHandler,
        .user_ctx = nullptr,
        .is_websocket = false,
        .handle_ws_control_frames = false,
        .supported_subprotocol = nullptr,
    };

    const httpd_uri_t* uris[] = {&kWsUri,     &kRootUri,     &kControlUri, &kLedOnUri,
                                 &kLedOffUri, &kHandOpenUri, &kHandCloseUri};
    for (const httpd_uri_t* u : uris) {
        err = httpd_register_uri_handler(hd, u);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "register %s: %s", u->uri, esp_err_to_name(err));
            httpd_stop(hd);
            return false;
        }
    }
    s_httpd = hd;
    ESP_LOGI(TAG, "httpd listening :%d%s and control GET / /control", kRobotWsPort, kRobotWsPath);
    return true;
}

bool StartHttpdWithRetry()
{
    // 無限リトライ禁止。失敗のたびに stop＋バックオフ（listen 112 の連鎖を止める）
    uint32_t backoff_ms = 2000;
    for (int attempt = 1; attempt <= kRobotWsHttpdMaxRetry; ++attempt) {
        if (!s_run.load()) {
            return false;
        }
        ESP_LOGI(TAG, "httpd_start attempt %d/%d", attempt, kRobotWsHttpdMaxRetry);
        {
            std::lock_guard<std::mutex> lock(s_httpd_mu);
            if (StartHttpdOnce()) {
                return true;
            }
        }
        ESP_LOGW(TAG, "httpd retry backoff %u ms", static_cast<unsigned>(backoff_ms));
        vTaskDelay(pdMS_TO_TICKS(backoff_ms));
        backoff_ms *= 2;
    }
    ESP_LOGE(TAG, "httpd give up after %d tries (not retrying forever)", kRobotWsHttpdMaxRetry);
    return false;
}

void ServerTask(void* /*arg*/)
{
    ESP_LOGI(TAG, "robot WS server task port=%d path=%s", kRobotWsPort, kRobotWsPath);

    while (s_run.load() && !WifiManager::GetInstance().IsConnected()) {
        ESP_LOGW(TAG, "waiting wifi...");
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
    if (!s_run.load()) {
        s_task = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    // CUSTOM/Xiaozhi 直後は内部 DRAM が足りないので、接続後さらに待つ
    ESP_LOGI(TAG, "wifi up, delay %u ms before httpd", static_cast<unsigned>(kRobotWsPostWifiDelayMs));
    vTaskDelay(pdMS_TO_TICKS(kRobotWsPostWifiDelayMs));

    esp_err_t ps_err = esp_wifi_set_ps(WIFI_PS_NONE);
    if (ps_err != ESP_OK) {
        ESP_LOGW(TAG, "wifi PS_NONE failed: %s", esp_err_to_name(ps_err));
    }

    LogStaIp();
    StartMdns();

    if (!StartHttpdWithRetry()) {
        while (s_run.load()) {
            vTaskDelay(pdMS_TO_TICKS(1000));
        }
    }

    uint32_t last_pcm_ms = 0;
    while (s_run.load()) {
        if (!WifiManager::GetInstance().IsConnected()) {
            ESP_LOGW(TAG, "wifi lost — stop httpd (no tight restart)");
            {
                std::lock_guard<std::mutex> lock(s_httpd_mu);
                StopHttpdLocked();
            }
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }
        if (s_httpd == nullptr) {
            // 切断後の再 listen も 3 回まで。成功するまでループし続けない
            if (!StartHttpdWithRetry()) {
                break;
            }
        }
        const uint32_t t = now_ms();
        // camera.capture は httpd スレッドでは撮らず、ここで処理（内部 DRAM 逼迫時の固まり緩和）
        PumpPendingCapture();
        if (t - last_pcm_ms >= kMediaPcmIntervalMs) {
            last_pcm_ms = t;
            PumpAudioIfNeeded();
        }
        vTaskDelay(pdMS_TO_TICKS(50));
    }

    {
        std::lock_guard<std::mutex> lock(s_httpd_mu);
        StopHttpdLocked();
    }
    StopMdns();
    s_task = nullptr;
    vTaskDelete(nullptr);
}

}  // namespace

void RobotWsStart()
{
    if (s_run.exchange(true)) {
        return;
    }
    if (kMediaListenAsServer) {
        ESP_LOGI(TAG, "RobotWsStart -> SERVER :%d%s (mdns %s.local)", kRobotWsPort, kRobotWsPath, kRobotWsMdnsHost);
        // ブートストラップも SPIRAM スタック（httpd と同じ DRAM 対策）
        xTaskCreatePinnedToCoreWithCaps(ServerTask, "obake_ws_srv", 8192, nullptr, 3, &s_task, 0,
                                        MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    } else {
        ESP_LOGI(TAG, "RobotWsStart -> client %s:%d%s", kMediaWsHost, kMediaWsPort, kMediaWsPath);
        xTaskCreatePinnedToCoreWithCaps(MediaClientTask, "obake_media", 8192, nullptr, 3, &s_task, 0,
                                        MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    }
}

void RobotWsStop()
{
    if (!s_run.exchange(false)) {
        return;
    }
    ESP_LOGI(TAG, "RobotWsStop");
    LogHeaps("before RobotWsStop");
    s_audio.store(false);
    s_capture_pending_fd.store(-1);
    {
        std::lock_guard<std::mutex> lock(s_httpd_mu);
        StopHttpdLocked();
    }
    for (int i = 0; i < 50 && s_task != nullptr; ++i) {
        vTaskDelay(pdMS_TO_TICKS(50));
    }
    DisconnectClient();
    StopMdns();
    LogHeaps("after RobotWsStop");
}

void RobotWsOnPreUpdate()
{
    // LED/手は httpd からキュー済み。先に Control → 続けてサーボ適用
    ControlApiDrain();
    ServoApiDrain();
}

}  // namespace stackchan::obake
