/*
 * ToF U010: Long Range・200 cm キャップ・ALT_CM ログ。
 */
#include "obake_tof.h"

#include "obake_config.h"
#include "obake_pahub.h"
#include "vl53l0x.h"

#include <atomic>
#include <esp_log.h>

namespace stackchan::obake {
namespace {

const char* TAG = "obake_tof";
VL53L0X s_tof;
bool s_ok = false;
/** hw タスク書き込み / UI 読み取り */
std::atomic<int> s_last_cm{-1};
uint32_t s_next_ms = 0;

bool i2c_write(uint8_t addr, const uint8_t* data, size_t len, void* /*user*/)
{
    return PahubWrite(addr, data, len);
}

bool i2c_write_read(uint8_t addr, const uint8_t* wdata, size_t wlen, uint8_t* rdata, size_t rlen, void* /*user*/)
{
    return PahubWriteRead(addr, wdata, wlen, rdata, rlen);
}

}  // namespace

bool TofInit()
{
    s_ok = false;
    s_last_cm.store(-1, std::memory_order_relaxed);
    s_next_ms = 0;
    if (!PahubOk()) {
        return false;
    }
    PahubLock();
    if (!PahubSelect(kChTof)) {
        PahubUnlock();
        return false;
    }
    s_tof.setI2c(i2c_write, i2c_write_read, nullptr);
    s_tof.setTimeout(500);
    s_ok = s_tof.init();
    if (s_ok) {
        // Long Range（公称 200 cm）
        s_tof.setSignalRateLimit(0.1f);
        s_tof.setVcselPulsePeriod(VL53L0X::VcselPeriodPreRange, 18);
        s_tof.setVcselPulsePeriod(VL53L0X::VcselPeriodFinalRange, 14);
        s_tof.setMeasurementTimingBudget(200000);
        s_tof.startContinuous(250);
    }
    ESP_LOGI(TAG, "ToF init %s", s_ok ? "ok" : "fail");
    PahubUnlock();
    return s_ok;
}

void TofDeinit()
{
    s_ok = false;
    s_last_cm.store(-1, std::memory_order_relaxed);
}

bool TofOk()
{
    return s_ok;
}

int TofLastCm()
{
    return s_last_cm.load(std::memory_order_relaxed);
}

void TofTick(uint32_t now_ms)
{
    if (!s_ok || now_ms < s_next_ms) {
        return;
    }
    s_next_ms = now_ms + kTofUpdateMs;
    PahubLock();
    if (!PahubSelect(kChTof)) {
        PahubUnlock();
        return;
    }
    const uint16_t mm = s_tof.readRangeContinuousMillimeters();
    const bool timed_out = s_tof.timeoutOccurred();
    PahubUnlock();

    // 画面の cm は MouthUi 側。シリアルはデバッグ時だけ（毎秒 LOGI は重い）
    if (timed_out || mm > kTofMaxMm) {
        s_last_cm.store(-1, std::memory_order_relaxed);
        ESP_LOGD(TAG, "ALT_CM=----");
    } else {
        const int cm = static_cast<int>((mm + 5) / 10);
        s_last_cm.store(cm, std::memory_order_relaxed);
        ESP_LOGD(TAG, "ALT_CM=%d", cm);
    }
}

}  // namespace stackchan::obake
