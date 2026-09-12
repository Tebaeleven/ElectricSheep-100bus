/*
 * SPDX-License-Identifier: MIT
 */
#include "addon_servo_guard.h"

#include <atomic>
#include <esp_timer.h>
#include <hal/hal.h>
#include <mooncake_log.h>
#include <settings.h>
#include <stackchan/stackchan.h>

static const std::string_view _tag = "AddonServo";

namespace stackchan::addons {

namespace {

/** false: サーバ／API 指令の首サーボを許可。自動きょろきょろは modifyLock 側で抑制。 */
constexpr bool kForceAllServosOff = false;

constexpr std::string_view kNvsNamespace = "addon";
constexpr std::string_view kServoHoldKey = "servo_hold";
constexpr std::string_view kIdleFreqPresetKey = "idle_freq_preset";

bool _nvs_idle_hold_enabled      = false;
int _idle_freq_preset            = 3;
bool _panel_open                 = false;
bool _panel_pause_applied        = false;
bool _we_set_modify_lock         = false;
uint32_t _motion_bypass_until_ms = 0;
int _user_motion_depth           = 0;

std::atomic<bool> _idle_freq_nvs_pending{false};
esp_timer_handle_t _idle_freq_save_timer = nullptr;

bool LoadNvsHold()
{
    Settings settings(kNvsNamespace.data(), false);
    return settings.GetInt(kServoHoldKey.data(), 0) != 0;
}

int LoadNvsIdleFreqPreset()
{
    Settings settings(kNvsNamespace.data(), false);
    int preset = settings.GetInt(kIdleFreqPresetKey.data(), 3);
    if (preset < 0) preset = 0;
    if (preset > 4) preset = 4;
    return preset;
}

void SaveNvsHold(bool enabled)
{
    Settings settings(kNvsNamespace.data(), true);
    settings.SetInt(kServoHoldKey.data(), enabled ? 1 : 0);
}

void SaveNvsIdleFreqPreset(int preset)
{
    Settings settings(kNvsNamespace.data(), true);
    settings.SetInt(kIdleFreqPresetKey.data(), preset);
}

void OnIdleFreqSaveTimer(void* /*arg*/)
{
    if (!_idle_freq_nvs_pending.exchange(false)) {
        return;
    }
    SaveNvsIdleFreqPreset(_idle_freq_preset);
}

void EnsureIdleFreqSaveTimer()
{
    if (_idle_freq_save_timer) {
        return;
    }

    const esp_timer_create_args_t args = {
        .callback               = &OnIdleFreqSaveTimer,
        .arg                    = nullptr,
        .dispatch_method        = ESP_TIMER_TASK,
        .name                   = "addon_idle_freq",
        .skip_unhandled_events  = true,
    };
    ESP_ERROR_CHECK(esp_timer_create(&args, &_idle_freq_save_timer));
}

void ApplyPanelPauseOnce()
{
    auto& motion = GetStackChan().motion();
    if (!motion.isModifyLocked()) {
        motion.setModifyLock(true);
        _we_set_modify_lock = true;
    }
}

void ReleasePanelPauseIfOurs()
{
    auto& motion = GetStackChan().motion();
    if (_we_set_modify_lock) {
        motion.setModifyLock(false);
        _we_set_modify_lock = false;
    }
}

void UpdatePanelPause(bool should_pause)
{
    if (should_pause == _panel_pause_applied) {
        return;
    }

    if (should_pause) {
        ApplyPanelPauseOnce();
    } else {
        ReleasePanelPauseIfOurs();
    }
    _panel_pause_applied = should_pause;
}

}  // namespace

bool ShouldHoldMotion()
{
    // 当面サーボ全停止
    if (kForceAllServosOff) {
        return true;
    }
    return _nvs_idle_hold_enabled;
}

bool AllowsServoMotion()
{
    // 当面: move / goHome も含め一切動かさない
    if (kForceAllServosOff) {
        return false;
    }
    const bool panel_pause_active = _panel_pause_applied || _panel_open;
    if (panel_pause_active) {
        if (_user_motion_depth > 0) {
            return true;
        }
        if (GetHAL().millis() < _motion_bypass_until_ms) {
            return true;
        }
        return false;
    }

    if (!_nvs_idle_hold_enabled) {
        return true;
    }
    if (_user_motion_depth > 0) {
        return true;
    }
    if (GetHAL().millis() < _motion_bypass_until_ms) {
        return true;
    }
    return false;
}

void BeginUserDirectedMotion()
{
    _user_motion_depth++;
}

void EndUserDirectedMotion()
{
    if (_user_motion_depth > 0) {
        _user_motion_depth--;
    }
}

bool IsServoHoldEnabled()
{
    return _nvs_idle_hold_enabled;
}

void SetServoHoldEnabled(bool enabled)
{
    _nvs_idle_hold_enabled = enabled;
    SaveNvsHold(enabled);
    mclog::tagInfo(_tag, "idle motion hold nvs={}", enabled);
}

void NotifyPanelOpening()
{
    static bool nvs_loaded = false;
    if (!nvs_loaded) {
        _nvs_idle_hold_enabled = LoadNvsHold();
        _idle_freq_preset      = LoadNvsIdleFreqPreset();
        nvs_loaded             = true;
    }

    _panel_open = true;
    UpdatePanelPause(true);
    mclog::tagInfo(_tag, "panel opening -> pause motion");
}

void GoServoHome()
{
    if (kForceAllServosOff) {
        mclog::tagInfo(_tag, "go home skipped (servos forced off)");
        return;
    }
    auto& motion = GetStackChan().motion();
    _motion_bypass_until_ms = GetHAL().millis() + 3500;
    UpdatePanelPause(false);
    motion.goHome(400);
    mclog::tagInfo(_tag, "go home (bypass panel pause 3.5s)");
}

void SyncServoPolicy(bool panel_open)
{
    static bool nvs_loaded = false;
    if (!nvs_loaded) {
        _nvs_idle_hold_enabled = LoadNvsHold();
        _idle_freq_preset      = LoadNvsIdleFreqPreset();
        nvs_loaded             = true;
    }

    _panel_open = panel_open;

    const bool bypass       = GetHAL().millis() < _motion_bypass_until_ms;
    const bool should_pause = !bypass && panel_open;
    UpdatePanelPause(should_pause);
}

int GetIdleMotionFreqPreset()
{
    return _idle_freq_preset;
}

void SetIdleMotionFreqPreset(int preset)
{
    if (preset < 0) preset = 0;
    if (preset > 4) preset = 4;
    _idle_freq_preset = preset;
}

void ScheduleIdleMotionFreqSave(uint32_t delay_ms)
{
    _idle_freq_nvs_pending.store(true);
    EnsureIdleFreqSaveTimer();
    esp_timer_stop(_idle_freq_save_timer);

    uint64_t delay_us = static_cast<uint64_t>(delay_ms) * 1000ULL;
    if (delay_us < 10000ULL) {
        delay_us = 10000ULL;
    }
    esp_timer_start_once(_idle_freq_save_timer, delay_us);
}

void SaveIdleMotionFreqPreset()
{
    ScheduleIdleMotionFreqSave(0);
}

float GetIdleMotionFreqMultiplier()
{
    switch (_idle_freq_preset) {
    case 0:
        return 0.25f;
    case 1:
        return 0.5f;
    case 2:
        return 0.75f;
    case 4:
        return 2.0f;
    case 3:
    default:
        return 1.0f;
    }
}

}  // namespace stackchan::addons
