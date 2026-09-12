/*
 * Port.A I2C（GPIO2/1）と PaHub 0x70。
 * bringup .ino は M5.Ex_I2C（Wire）だが、本番は ESP-IDF i2c_master。
 * CoreS3 では AW9523 P0_1=BUS_OUT_EN と GPIO2 レーザー競合がポイント。
 */
#include "obake_pahub.h"

#include "obake_config.h"

#include <hal/board/hal_bridge.h>
#include <hal/hal.h>

#include <driver/gpio.h>
#include <driver/i2c_master.h>
#include <esp_log.h>
#include <esp_rom_sys.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <freertos/task.h>

namespace stackchan::obake {
namespace {

const char* TAG = "obake_pahub";
i2c_master_bus_handle_t s_bus = nullptr;
SemaphoreHandle_t s_mutex = nullptr;
bool s_ok = false;
/** HUD 用: ok / bus / probe / pwr / -- */
const char* s_status_tag = "--";
/** 現在の SCL 速度（失敗時に 100k へ落とす） */
uint32_t s_scl_hz = kI2cHz;

/** 同一アドレスの add/remove 連打を避けるための小さなキャッシュ */
struct DevCache {
    uint8_t addr = 0;
    i2c_master_dev_handle_t handle = nullptr;
};
DevCache s_devs[4] = {};

/** PaHub probe 回数・間隔（配線・電源立ち上がり待ち） */
constexpr int kPahubProbeTries = 8;
constexpr uint32_t kPahubSettleMs = 100;
constexpr uint32_t kPahubProbeGapMs = 40;
/** CoreS3 AW9523（内部 I2C）。P0_1 = BUS_OUT_EN（Port.A プルアップ） */
constexpr uint8_t kAw9523Addr = 0x58;
constexpr uint8_t kAw9523RegOutP0 = 0x02;
constexpr uint8_t kAw9523OutP0PortA = 0b00000111;  // stackchan.cc Aw9523 初期値と同じ

i2c_master_dev_handle_t get_dev(uint8_t addr)
{
    for (auto& d : s_devs) {
        if (d.handle && d.addr == addr) {
            return d.handle;
        }
    }
    i2c_device_config_t cfg = {};
    cfg.dev_addr_length = I2C_ADDR_BIT_LEN_7;
    cfg.device_address = addr;
    cfg.scl_speed_hz = s_scl_hz;
    i2c_master_dev_handle_t dev = nullptr;
    if (i2c_master_bus_add_device(s_bus, &cfg, &dev) != ESP_OK) {
        return nullptr;
    }
    for (auto& d : s_devs) {
        if (!d.handle) {
            d.addr = addr;
            d.handle = dev;
            return dev;
        }
    }
    // キャッシュ満杯: 先頭を入れ替え
    if (s_devs[0].handle) {
        i2c_master_bus_rm_device(s_devs[0].handle);
    }
    s_devs[0].addr = addr;
    s_devs[0].handle = dev;
    return dev;
}

void clear_devs()
{
    for (auto& d : s_devs) {
        if (d.handle) {
            i2c_master_bus_rm_device(d.handle);
            d.handle = nullptr;
            d.addr = 0;
        }
    }
}

/** レーザー等で GPIO が OUTPUT 化されたあとに I2C を取れるようリセット */
void reset_port_a_pins()
{
    gpio_reset_pin(kPortASda);
    gpio_reset_pin(kPortAScl);
}

/**
 * Arduino M5.begin 相当: AW9523 で Port.A の BUS_OUT_EN を再度 HIGH にする。
 * 電源サイクル後や ResetAw88298 後に SCL が浮かないと PaHub が見えない。
 */
bool ensure_port_a_bus_out()
{
    i2c_master_bus_handle_t internal = hal_bridge::board_get_i2c_bus();
    if (!internal) {
        ESP_LOGW(TAG, "internal I2C missing — cannot set AW9523 BUS_OUT");
        return false;
    }
    i2c_device_config_t cfg = {};
    cfg.dev_addr_length = I2C_ADDR_BIT_LEN_7;
    cfg.device_address = kAw9523Addr;
    cfg.scl_speed_hz = 400000;
    i2c_master_dev_handle_t dev = nullptr;
    if (i2c_master_bus_add_device(internal, &cfg, &dev) != ESP_OK) {
        ESP_LOGW(TAG, "AW9523 add_device failed");
        return false;
    }
    const uint8_t buf[2] = {kAw9523RegOutP0, kAw9523OutP0PortA};
    const esp_err_t err = i2c_master_transmit(dev, buf, sizeof(buf), pdMS_TO_TICKS(100));
    i2c_master_bus_rm_device(dev);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "AW9523 BUS_OUT write failed: %s", esp_err_to_name(err));
        return false;
    }
    ESP_LOGI(TAG, "AW9523 P0=0x%02X (BUS_OUT_EN on)", kAw9523OutP0PortA);
    return true;
}

/** CUSTOM 入場時にレーザーが GPIO2 を掴んでいても必ず解放する */
void release_laser_pin_for_port_a()
{
    // setLaserEnabled(false) は CUSTOM 中にピン解放する実装になっている
    GetHAL().setLaserEnabled(false);
    reset_port_a_pins();
}

bool probe_pahub_with_retries()
{
    s_ok = false;
    for (int try_i = 0; try_i < kPahubProbeTries && !s_ok; ++try_i) {
        s_ok = PahubProbe(kPahubAddr);
        if (!s_ok) {
            ESP_LOGW(TAG, "PaHub 0x%02X probe miss (%d/%d) scl=%lu", kPahubAddr, try_i + 1, kPahubProbeTries,
                     static_cast<unsigned long>(s_scl_hz));
            // バスが固まっているときがあるので途中で recovery
            if (s_bus && (try_i == 2 || try_i == 5)) {
                (void)i2c_master_bus_reset(s_bus);
            }
            vTaskDelay(pdMS_TO_TICKS(kPahubProbeGapMs));
        }
    }
    s_status_tag = s_ok ? "ok" : "probe";
    return s_ok;
}

bool create_port_a_bus(uint32_t scl_hz)
{
    clear_devs();
    if (s_bus) {
        i2c_del_master_bus(s_bus);
        s_bus = nullptr;
    }
    release_laser_pin_for_port_a();
    if (!ensure_port_a_bus_out()) {
        s_status_tag = "pwr";
        // 電源アサート失敗でもバス作成は試し、失敗理由を probe 側で見える化する
    }
    vTaskDelay(pdMS_TO_TICKS(20));

    s_scl_hz = scl_hz;
    i2c_master_bus_config_t bus_cfg = {};
    bus_cfg.i2c_port = static_cast<i2c_port_t>(kPortAI2cPort);
    bus_cfg.sda_io_num = kPortASda;
    bus_cfg.scl_io_num = kPortAScl;
    bus_cfg.clk_source = I2C_CLK_SRC_DEFAULT;
    bus_cfg.glitch_ignore_cnt = 7;
    bus_cfg.flags.enable_internal_pullup = true;
    esp_err_t err = i2c_new_master_bus(&bus_cfg, &s_bus);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_new_master_bus failed: %s (scl=%lu)", esp_err_to_name(err),
                 static_cast<unsigned long>(scl_hz));
        s_bus = nullptr;
        s_ok = false;
        s_status_tag = "bus";
        return false;
    }
    (void)i2c_master_bus_reset(s_bus);
    vTaskDelay(pdMS_TO_TICKS(kPahubSettleMs));
    return true;
}

}  // namespace

bool PahubInit()
{
    // バスはあるが probe 失敗のまま固まるのを防ぎ、再 probe / 再 create する
    if (s_bus) {
        if (s_ok) {
            return true;
        }
        ESP_LOGW(TAG, "PaHub bus up but not ok — re-probe then recreate");
        ensure_port_a_bus_out();
        (void)i2c_master_bus_reset(s_bus);
        if (probe_pahub_with_retries()) {
            ESP_LOGI(TAG, "PaHub 0x%02X ok (re-probe)", kPahubAddr);
            return true;
        }
        // 400k でダメなら 100k でバスごと作り直し（.ino は 400k だが IDF 側の余裕用）
        if (!create_port_a_bus(100000) || !probe_pahub_with_retries()) {
            ESP_LOGI(TAG, "PaHub 0x%02X missing after recreate", kPahubAddr);
            return false;
        }
        ESP_LOGI(TAG, "PaHub 0x%02X ok (recreate 100k)", kPahubAddr);
        return true;
    }
    if (!s_mutex) {
        s_mutex = xSemaphoreCreateMutex();
    }

    // まず bringup と同じ 400k。失敗時のみ 100k
    if (!create_port_a_bus(kI2cHz) || !probe_pahub_with_retries()) {
        if (s_status_tag && s_status_tag[0] == 'b') {
            // bus 作成自体が失敗
            return false;
        }
        ESP_LOGW(TAG, "PaHub miss @%luk — retry @100k", static_cast<unsigned long>(kI2cHz / 1000));
        if (!create_port_a_bus(100000) || !probe_pahub_with_retries()) {
            ESP_LOGI(TAG, "PaHub 0x%02X missing (SDA=GPIO%d SCL=GPIO%d port=%d)", kPahubAddr,
                     static_cast<int>(kPortASda), static_cast<int>(kPortAScl), kPortAI2cPort);
            return false;
        }
    }
    ESP_LOGI(TAG, "PaHub 0x%02X %s (SDA=GPIO%d SCL=GPIO%d port=%d scl=%lu)", kPahubAddr, s_ok ? "ok" : "missing",
             static_cast<int>(kPortASda), static_cast<int>(kPortAScl), kPortAI2cPort,
             static_cast<unsigned long>(s_scl_hz));
    return s_ok;
}

void PahubDeinit()
{
    clear_devs();
    if (s_bus) {
        i2c_del_master_bus(s_bus);
        s_bus = nullptr;
    }
    if (s_mutex) {
        vSemaphoreDelete(s_mutex);
        s_mutex = nullptr;
    }
    s_ok = false;
    s_status_tag = "--";
    s_scl_hz = kI2cHz;
}

bool PahubOk()
{
    return s_ok;
}

const char* PahubStatusTag()
{
    return s_status_tag ? s_status_tag : "--";
}

bool PahubPortAInUse()
{
    // バス確保中は GPIO2 をレーザーに渡さない
    return s_bus != nullptr;
}

void PahubLock()
{
    if (s_mutex) {
        xSemaphoreTake(s_mutex, portMAX_DELAY);
    }
}

void PahubUnlock()
{
    if (s_mutex) {
        xSemaphoreGive(s_mutex);
    }
}

bool PahubSelect(uint8_t ch)
{
    if (!s_bus || ch > 7) {
        return false;
    }
    const uint8_t mask = static_cast<uint8_t>(1u << ch);
    const bool ok = PahubWrite(kPahubAddr, &mask, 1);
    esp_rom_delay_us(50);
    return ok;
}

bool PahubProbe(uint8_t addr)
{
    if (!s_bus) {
        return false;
    }
    return i2c_master_probe(s_bus, addr, pdMS_TO_TICKS(50)) == ESP_OK;
}

bool PahubWrite(uint8_t addr, const uint8_t* data, size_t len)
{
    if (!s_bus || !data || len == 0) {
        return false;
    }
    i2c_master_dev_handle_t dev = get_dev(addr);
    if (!dev) {
        return false;
    }
    return i2c_master_transmit(dev, data, len, pdMS_TO_TICKS(100)) == ESP_OK;
}

bool PahubWriteRead(uint8_t addr, const uint8_t* wdata, size_t wlen, uint8_t* rdata, size_t rlen)
{
    if (!s_bus || !wdata || wlen == 0 || !rdata || rlen == 0) {
        return false;
    }
    i2c_master_dev_handle_t dev = get_dev(addr);
    if (!dev) {
        return false;
    }
    return i2c_master_transmit_receive(dev, wdata, wlen, rdata, rlen, pdMS_TO_TICKS(100)) == ESP_OK;
}

}  // namespace stackchan::obake

/** Hal から C リンケージで参照（GPIO2 レーザー競合防止） */
extern "C" bool stackchan_obake_pahub_port_a_in_use()
{
    return stackchan::obake::PahubPortAInUse();
}
