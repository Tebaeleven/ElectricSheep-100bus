/*
 * StackChan custom: panel pause + NVS servo hold (blocks auto motion; MCP/user moves OK).
 * SPDX-License-Identifier: MIT
 */
#pragma once

#include <cstdint>

namespace stackchan::addons {

void SyncServoPolicy(bool panel_open);

/** Call as soon as panel open is detected (before motion update). */
void NotifyPanelOpening();

bool ShouldHoldMotion();
bool AllowsServoMotion();
void BeginUserDirectedMotion();
void EndUserDirectedMotion();

bool IsServoHoldEnabled();
void SetServoHoldEnabled(bool enabled);
void GoServoHome();

/** Idle random motion frequency preset index: 0..4 */
int GetIdleMotionFreqPreset();
/** Update in-memory preset only (safe from UI callbacks). */
void SetIdleMotionFreqPreset(int preset);
/** Queue NVS write on esp_timer task (does not block LVGL). */
void ScheduleIdleMotionFreqSave(uint32_t delay_ms = 400);
/** Flush preset to NVS soon (still deferred off LVGL thread). */
void SaveIdleMotionFreqPreset();
float GetIdleMotionFreqMultiplier();

}  // namespace stackchan::addons
