/*
 * Custom firmware OTA (WinApp LAN publish).
 * SPDX-License-Identifier: MIT
 */
#include "custom_ota.h"

#include "custom_integration.h"

#include <hal/hal.h>
#include <mooncake_log.h>
#include <settings.h>

namespace stackchan::custom {

static const std::string_view _tag = "CustomOTA";

static constexpr const char* kDefaultFirmwareOtaUrl = "http://192.168.10.200:18080/xiaozhi/ota/";

std::string GetFirmwareOtaUrl()
{
    Settings settings("custom", false);
    std::string url = settings.GetString("fw_ota_url");
    if (url.empty()) {
        return kDefaultFirmwareOtaUrl;
    }
    return url;
}

void SetFirmwareOtaUrl(std::string_view url)
{
    Settings settings("custom", true);
    settings.SetString("fw_ota_url", std::string(url));
}

bool CheckAndInstallFirmware(std::function<void(std::string_view)> onLog)
{
    if (!IsCustomSessionActive()) {
        mclog::tagWarn(_tag, "firmware OTA refused (not custom session)");
        if (onLog) {
            onLog("Custom session required");
        }
        return false;
    }

    const std::string fw_url = GetFirmwareOtaUrl();
    Settings wifi("wifi", true);
    const std::string saved = wifi.GetString("ota_url");
    wifi.SetString("ota_url", fw_url);
    mclog::tagInfo(_tag, "firmware OTA check via {}", fw_url);

    const bool ok = GetHAL().updateFirmware(onLog ? onLog : [](std::string_view) {});

    if (!saved.empty()) {
        wifi.SetString("ota_url", saved);
    }
    return ok;
}

}  // namespace stackchan::custom
