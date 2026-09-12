/*
 * Custom firmware OTA (WinApp LAN publish). Uses official Hal::updateFirmware.
 * SPDX-License-Identifier: MIT
 */
#pragma once

#include <functional>
#include <string>
#include <string_view>

namespace stackchan::custom {

/** NVS override or default WinApp firmware OTA JSON URL. */
std::string GetFirmwareOtaUrl();

void SetFirmwareOtaUrl(std::string_view url);

/**
 * Point wifi:ota_url at the firmware publisher, then run Hal::updateFirmware.
 * Restores the previous conversation OTA URL if upgrade does not reboot.
 */
bool CheckAndInstallFirmware(std::function<void(std::string_view)> onLog);

}  // namespace stackchan::custom
