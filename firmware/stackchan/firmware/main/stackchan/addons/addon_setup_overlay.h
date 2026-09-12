/*
 * StackChan — open official Setup menu on top of Xiaozhi without reboot.
 * SPDX-License-Identifier: MIT
 */
#pragma once

namespace stackchan::addons {

void open_addon_setup_overlay();
void update_addon_setup_overlay();
void close_addon_setup_overlay();
bool is_addon_setup_overlay_active();

}  // namespace stackchan::addons
