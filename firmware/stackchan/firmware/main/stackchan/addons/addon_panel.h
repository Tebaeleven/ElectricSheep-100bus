/*
 * StackChan custom addon: right-edge swipe panel (IR, AI backend, etc.).
 * SPDX-License-Identifier: MIT
 */
#pragma once

#include <lvgl.h>

namespace stackchan::addons {

/** Addons panel UI version (independent from firmware version). */
inline constexpr const char* kAddonVersion = "2.0.0";

void create_addon_panel(lv_obj_t* parent = nullptr);
void update_addon_panel_gesture();
void update_addon_panel();
void destroy_addon_panel();
bool is_addon_panel_active();
bool is_addon_ui_modal_active();

/** True while addon panel is open, edge swipe is in progress, or tap cooldown is active. */
bool blocks_agent_tap_to_talk();

}  // namespace stackchan::addons
