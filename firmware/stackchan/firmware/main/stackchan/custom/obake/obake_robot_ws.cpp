/*
 * PC/homelab の Media WS へクライアント接続し、JPEG/PCM を上行する。
 * プロトコルは homelab/obake_media/server.py と一致。
 */
#include "obake_robot_ws.h"

#include "obake_config.h"
#include "obake_servo_api.h"

#include <hal/board/cores3_audio_codec.h>

#include <algorithm>
#include <atomic>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include <ArduinoJson.hpp>
#include <audio/audio_codec.h>
#include <board.h>
#include <esp_heap_caps.h>
#include <esp_log.h>
#include <esp_timer.h>
#include <esp_wifi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/idf_additions.h>
#include <freertos/task.h>
#include <hal/board/hal_bridge.h>
#include <jpg/image_to_jpeg.h>
#include <web_socket.h>
#include <wifi_manager.h>

namespace stackchan::obake {
namespace {

const char* TAG = "obake_media_ws";

/** server.py と同じ型番号 */
enum class BinType : uint8_t {
    Jpeg = 0x02,
    Pcm = 0x20,
};

std::atomic<bool> s_run{false};
TaskHandle_t s_task = nullptr;
std::mutex s_ws_mu;
std::unique_ptr<WebSocket> s_ws;
std::atomic<bool> s_connected{false};

uint32_t now_ms()
{
    return static_cast<uint32_t>(esp_timer_get_time() / 1000ULL);
}

/** 実際の TCP 接続先。LAN マップがあれば IP、なければホスト名（要 LAN DNS） */
const char* ConnectHost()
{
    if (kMediaWsLanIp != nullptr && kMediaWsLanIp[0] != '\0') {
        return kMediaWsLanIp;
    }
    return kMediaWsHost;
}

std::string BuildUrl()
{
    // 論理名は kMediaWsHost。接続ソケットは ConnectHost()（LAN マップ優先）
    char buf[192];
    snprintf(buf, sizeof(buf), "ws://%s:%d%s", ConnectHost(), kMediaWsPort, kMediaWsPath);
    return std::string(buf);
}

bool SendFramed(WebSocket* ws, BinType type, const uint8_t* payload, size_t len)
{
    if (ws == nullptr || !ws->IsConnected()) {
        return false;
    }
    // [type:1][len:4 BE][payload]
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
    // 下行: {"cmd":"set_head","yaw":..,"pitch":..,"speed":..}
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

bool CaptureAndSendJpeg(WebSocket* ws)
{
    // StackChanCamera 経由（V4L2 フォーマットで JPEG 化）
    auto* camera = hal_bridge::board_get_camera();
    if (camera == nullptr) {
        return false;
    }
    if (!camera->StreamCaptures()) {
        return false;
    }
    uint8_t* jpeg = nullptr;
    size_t jpeg_len = 0;
    if (!image_to_jpeg(const_cast<uint8_t*>(camera->GetFrameData()), camera->GetFrameSize(), camera->GetFrameWidth(),
                       camera->GetFrameHeight(), static_cast<v4l2_pix_fmt_t>(camera->GetFrameFormat()),
                       kMediaJpegQuality, &jpeg, &jpeg_len)) {
        return false;
    }
    const bool ok = SendFramed(ws, BinType::Jpeg, jpeg, jpeg_len);
    free(jpeg);
    return ok;
}

bool CaptureAndSendPcm(WebSocket* ws)
{
    // Xiaozhi AudioService とマイクを奪い合わない：直近 Read の tee を使う
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
    std::vector<int16_t> mono(frames);
    for (size_t i = 0; i < frames; ++i) {
        mono[i] = chunk[i * static_cast<size_t>(channels)];
    }
    return SendFramed(ws, BinType::Pcm, reinterpret_cast<const uint8_t*>(mono.data()),
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

    // MQTT 後の MAX_MODEM 省電力だと TCP が EHOSTUNREACH(0x71) になりやすいので Media 中は無効化
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
        ESP_LOGI(TAG, "connected");
        s_connected.store(true);
    });
    ws->OnDisconnected([]() {
        ESP_LOGW(TAG, "disconnected");
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

    // シリアル検証用にホスト名を明示（Windows hosts 非依存の LAN マップも併記）
    ESP_LOGI(TAG, "connecting ws://%s:%d%s", kMediaWsHost, kMediaWsPort, kMediaWsPath);
    if (ConnectHost() != kMediaWsHost) {
        ESP_LOGI(TAG, "resolve %s -> %s (firmware LAN map)", kMediaWsHost, ConnectHost());
    }
    const std::string url = BuildUrl();
    if (!ws->Connect(url.c_str())) {
        ESP_LOGW(TAG, "connect failed (check LAN map / dns_responder / server / firewall)");
        return false;
    }

    // hello（PCM レート通知）
    auto* codec = Board::GetInstance().GetAudioCodec();
    const int rate = codec ? codec->input_sample_rate() : 24000;
    char hello[96];
    snprintf(hello, sizeof(hello), "{\"type\":\"hello\",\"pcm_rate\":%d}", rate);
    ws->Send(std::string(hello));

    {
        std::lock_guard<std::mutex> lock(s_ws_mu);
        s_ws = std::move(ws);
    }
    return true;
}

void Disconnect()
{
    std::lock_guard<std::mutex> lock(s_ws_mu);
    if (s_ws) {
        s_ws->Close();
        s_ws.reset();
    }
    s_connected.store(false);
}

void MediaTask(void* /*arg*/)
{
    ESP_LOGI(TAG, "media client task (host=%s lan_ip=%s)", kMediaWsHost,
             (kMediaWsLanIp && kMediaWsLanIp[0]) ? kMediaWsLanIp : "(dns)");
    // Xiaozhi / Wi-Fi 安定待ち
    vTaskDelay(pdMS_TO_TICKS(3000));

    uint32_t last_jpeg_try_ms = 0;
    uint32_t last_pcm_ms = 0;
    // 最後に JPEG 送信に成功した時刻（停滞検知用）
    uint32_t last_jpeg_ok_ms = now_ms();
    uint32_t jpeg_fail_streak = 0;
    while (s_run.load()) {
        if (!WifiManager::GetInstance().IsConnected()) {
            ESP_LOGW(TAG, "waiting wifi...");
            Disconnect();
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        if (!s_connected.load() || s_ws == nullptr || !s_ws->IsConnected()) {
            Disconnect();
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
        // JPEG が長く成功しない＝カメラ待ち固まり／送信失敗 → 再接続で回復を試みる
        if (t - last_jpeg_ok_ms >= kMediaJpegStallMs) {
            ESP_LOGW(TAG, "jpeg stall %lu ms — reconnect", static_cast<unsigned long>(t - last_jpeg_ok_ms));
            Disconnect();
            vTaskDelay(pdMS_TO_TICKS(200));
            continue;
        }

        if (t - last_jpeg_try_ms >= kMediaJpegIntervalMs) {
            last_jpeg_try_ms = t;
            if (CaptureAndSendJpeg(ws)) {
                last_jpeg_ok_ms = t;
                jpeg_fail_streak = 0;
            } else {
                jpeg_fail_streak++;
                // 連続失敗は間引いてログ（毎フレームは出さない）
                if ((jpeg_fail_streak % 5U) == 1U) {
                    ESP_LOGW(TAG, "jpeg capture/send failed (streak=%lu)",
                             static_cast<unsigned long>(jpeg_fail_streak));
                }
            }
        }
        // PCM は間隔を空け、マイク読み取りで JPEG ループを塞がない
        if (t - last_pcm_ms >= kMediaPcmIntervalMs) {
            last_pcm_ms = t;
            CaptureAndSendPcm(ws);
        }
        vTaskDelay(pdMS_TO_TICKS(20));
    }

    Disconnect();
    s_task = nullptr;
    vTaskDelete(nullptr);
}

}  // namespace

void RobotWsStart()
{
    if (s_run.exchange(true)) {
        return;
    }
    ESP_LOGI(TAG, "RobotWsStart -> client %s:%d%s", kMediaWsHost, kMediaWsPort, kMediaWsPath);
    // 内部 DRAM 節約のため SPIRAM スタック
    xTaskCreatePinnedToCoreWithCaps(MediaTask, "obake_media", 8192, nullptr, 3, &s_task, 0,
                                    MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
}

void RobotWsStop()
{
    if (!s_run.exchange(false)) {
        return;
    }
    ESP_LOGI(TAG, "RobotWsStop");
    for (int i = 0; i < 50 && s_task != nullptr; ++i) {
        vTaskDelay(pdMS_TO_TICKS(50));
    }
    Disconnect();
}

void RobotWsOnPreUpdate()
{
    ServoApiDrain();
}

}  // namespace stackchan::obake
