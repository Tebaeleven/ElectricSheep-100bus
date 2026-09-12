/*
 * SPDX-License-Identifier: MIT
 */
#include "ir_on_off.h"

namespace stackchan::ir {

namespace {

std::string_view ActionForDevice(std::string_view device, bool on)
{
    if (device == "light") {
        return "power";
    }
    if (device == "tv") {
        return "power";
    }
    if (device == "aircon") {
        return on ? "cool_on" : "off";
    }
    if (device == "speaker") {
        return on ? "power" : "stop";
    }
    if (device == "unknown") {
        return "fan_power";
    }
    return on ? "power" : "off";
}

}  // namespace

std::string_view GetOnAction(std::string_view device_id)
{
    return ActionForDevice(device_id, true);
}

std::string_view GetOffAction(std::string_view device_id)
{
    return ActionForDevice(device_id, false);
}

}  // namespace stackchan::ir
