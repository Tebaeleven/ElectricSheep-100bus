/*
 * StackChan custom: Japanese display labels for IR catalog (IDs stay English).
 * SPDX-License-Identifier: MIT
 */
#pragma once

#include <string>
#include <string_view>

namespace stackchan::ir {

/** Japanese label for device id (light, tv, …). Falls back to id if unknown. */
std::string DeviceLabelJa(std::string_view device_id);

/** Japanese label for action id (power, vol_up, …). Falls back to id if unknown. */
std::string ActionLabelJa(std::string_view action_id);

}  // namespace stackchan::ir
