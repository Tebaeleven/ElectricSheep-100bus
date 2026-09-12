/*

 * StackChan custom: DVD-style screensaver while Addons panel is open (burn-in guard).

 * SPDX-License-Identifier: MIT

 */

#pragma once



namespace stackchan::addons {



void notify_addon_panel_activity();

void update_addon_screensaver(bool panel_open);

bool is_addon_screensaver_active();



}  // namespace stackchan::addons

