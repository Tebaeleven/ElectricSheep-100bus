/*
 * PaHub・目・ToF・口を Custom セッションに接続。サーボは扱わない。
 */
#include "obake_runtime.h"

#include "obake_config.h"
#include "obake_eyes.h"
#include "obake_mouth_ui.h"
#include "obake_pahub.h"
#include "obake_tof.h"
#include "obake_wake_config.h"

#include <stackchan/stackchan.h>  // GetStackChan（modifyLock）

#include <atomic>
#include <esp_log.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

namespace stackchan::obake {
namespace {

const char* TAG = "obake_runtime";
bool s_started = false;
TaskHandle_t s_task = nullptr;
std::atomic<bool> s_task_run{false};

/** 起動直後のバス競合を避ける遅延 */
constexpr uint32_t kHwStartDelayMs = 400;
/** PaHub 未成功時の再試行間隔・回数 */
constexpr uint32_t kPahubRetryMs = 2000;
constexpr int kPahubRetryMax = 15;

uint32_t now_ms()
{
    return static_cast<uint32_t>(esp_timer_get_time() / 1000ULL);
}

/** PaHub → 目 → ToF */
bool start_pahub_chain()
{
    if (PahubInit()) {
        EyesInit();
        TofInit();
        return true;
    }
    ESP_LOGW(TAG, "PaHub miss (tag=%s)", PahubStatusTag());
    return false;
}

void hw_task(void* /*arg*/)
{
    ESP_LOGI(TAG, "hw task start (wake=%s thr~%d%%)", kWakeDisplayName, kWakeThresholdPercentHint);
    // EnterCustomSession 直後の即 init を避け、少し待ってから初回
    vTaskDelay(pdMS_TO_TICKS(kHwStartDelayMs));
    start_pahub_chain();

    int retries_left = kPahubRetryMax;
    uint32_t next_retry_ms = now_ms() + kPahubRetryMs;

    while (s_task_run.load(std::memory_order_relaxed)) {
        const uint32_t t = now_ms();
        // 未検出なら周期的に deinit→再 init（配線・電源遅延対策）
        if (!PahubOk() && retries_left > 0 && t >= next_retry_ms) {
            ESP_LOGW(TAG, "PaHub retry (%d left)", retries_left);
            EyesDeinit();
            TofDeinit();
            PahubDeinit();
            if (start_pahub_chain()) {
                retries_left = 0;
            } else {
                --retries_left;
                next_retry_ms = t + kPahubRetryMs;
            }
        }
        EyesTick(t);
        TofTick(t);
        vTaskDelay(pdMS_TO_TICKS(kHwTickMs));
    }
    s_task = nullptr;
    vTaskDelete(nullptr);
}

}  // namespace

void RuntimeStart()
{
    // HW タスクは1本。口 UI は UI ready 後の再入でも毎回試す
    if (!s_started) {
        s_started = true;
        ESP_LOGI(TAG, "start Obake face HW (deferred init)");
        s_task_run.store(true, std::memory_order_relaxed);
        xTaskCreatePinnedToCore(hw_task, "obake_hw", 8192, nullptr, 5, &s_task, 0);
    }
    MouthUiCreate();
}

void RuntimeOnUiFrame()
{
    if (!s_started) {
        return;
    }
    MouthUiUpdate();
}

void RuntimeOnPreUpdate()
{
    // I2C は hw タスク側。当面サーボは modifyLock でも止める
    if (GetStackChan().hasAvatar()) {
        auto& motion = GetStackChan().motion();
        if (!motion.isModifyLocked()) {
            motion.setModifyLock(true);
        }
    }
}

void RuntimeStop()
{
    if (!s_started) {
        return;
    }
    s_task_run.store(false, std::memory_order_relaxed);
    for (int i = 0; i < 50 && s_task != nullptr; ++i) {
        vTaskDelay(pdMS_TO_TICKS(20));
    }
    EyesDeinit();
    TofDeinit();
    PahubDeinit();
    s_started = false;
    ESP_LOGI(TAG, "hw stopped (mouth UI kept)");
}

}  // namespace stackchan::obake
