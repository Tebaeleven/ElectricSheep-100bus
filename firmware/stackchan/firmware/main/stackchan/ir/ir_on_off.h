/*
 * StackChan custom: per-device ON/OFF IR actions for simplified Addons UI.
 * SPDX-License-Identifier: MIT
 */
#pragma once

#include <string>
#include <string_view>

namespace stackchan::ir {

std::string_view GetOnAction(std::string_view device_id);
std::string_view GetOffAction(std::string_view device_id);

}  // namespace stackchan::ir
