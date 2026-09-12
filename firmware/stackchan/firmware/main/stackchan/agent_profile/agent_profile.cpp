/*
 * StackChan custom: AI agent connection profiles.
 * SPDX-License-Identifier: MIT
 */
#include "agent_profile.h"

#include <mooncake_log.h>
#include <ota.h>
#include <settings.h>

static const std::string_view _tag = "AgentProfile";

namespace stackchan::agent_profile {

namespace {

constexpr std::string_view kNvsNamespace     = "agent";
constexpr std::string_view kActiveProfileKey = "profile_id";
constexpr std::string_view kCustomOtaOllama  = "ota_ollama";
constexpr std::string_view kCustomOtaCopilot = "ota_copilot";

const char* CustomOtaKey(ProfileId profile)
{
    switch (profile) {
    case ProfileId::LocalOllama:
        return kCustomOtaOllama.data();
    case ProfileId::LocalCopilot:
        return kCustomOtaCopilot.data();
    default:
        return nullptr;
    }
}

}  // namespace

const ProfileDescriptor* FindDescriptor(ProfileId profile)
{
    for (const auto& item : kProfiles) {
        if (item.id == profile) {
            return &item;
        }
    }
    return FindDescriptor(kDefaultProfile);
}

const ProfileDescriptor* FindDescriptorByNvsId(std::string_view nvs_id)
{
    for (const auto& item : kProfiles) {
        if (nvs_id == item.nvs_id) {
            return &item;
        }
    }
    return FindDescriptor(kDefaultProfile);
}

ProfileId GetActiveProfile()
{
    Settings settings(kNvsNamespace.data(), false);
    const auto* default_desc = FindDescriptor(kDefaultProfile);
    const auto stored = settings.GetString(kActiveProfileKey.data(), default_desc->nvs_id);
    return FindDescriptorByNvsId(stored)->id;
}

void SetActiveProfile(ProfileId profile)
{
    const auto* desc = FindDescriptor(profile);
    Settings settings(kNvsNamespace.data(), true);
    settings.SetString(kActiveProfileKey.data(), desc->nvs_id);
    mclog::tagInfo(_tag, "active profile set to {} ({})", desc->label_en, desc->nvs_id);
}

std::string GetOtaUrl(ProfileId profile)
{
    const auto* desc = FindDescriptor(profile);
    if (profile == ProfileId::Cloud) {
        return desc->default_ota_url;
    }

    const char* custom_key = CustomOtaKey(profile);
    if (custom_key == nullptr) {
        return desc->default_ota_url;
    }

    Settings settings(kNvsNamespace.data(), false);
    auto custom = settings.GetString(custom_key, "");
    if (custom.empty()) {
        return desc->default_ota_url;
    }
    return custom;
}

void SetCustomOtaUrl(ProfileId profile, std::string_view url)
{
    const char* custom_key = CustomOtaKey(profile);
    if (custom_key == nullptr) {
        return;
    }
    Settings settings(kNvsNamespace.data(), true);
    settings.SetString(custom_key, std::string(url));
}

bool ApplyProfile(ProfileId profile, bool run_ota_check)
{
    const auto* desc = FindDescriptor(profile);
    const std::string ota_url = GetOtaUrl(profile);

    mclog::tagInfo(_tag, "apply profile {} -> OTA {}", desc->label_en, ota_url);

    Settings wifi_settings("wifi", true);
    if (profile == ProfileId::Cloud) {
        wifi_settings.EraseKey("ota_url");
    } else {
        wifi_settings.SetString("ota_url", ota_url);
    }

    SetActiveProfile(profile);

    if (!run_ota_check) {
        return true;
    }

    Ota ota;
    const esp_err_t err = ota.CheckVersion();
    if (err != ESP_OK) {
        mclog::tagError(_tag, "OTA check failed: {}", esp_err_to_name(err));
        return false;
    }

    mclog::tagInfo(_tag, "OTA check OK, websocket config updated={}", ota.HasWebsocketConfig());
    return true;
}

}  // namespace stackchan::agent_profile
