/*
 * StackChan custom: AI agent connection profiles (cloud / local LLM / Copilot).
 * SPDX-License-Identifier: MIT
 */
#pragma once

#include <string>
#include <string_view>

namespace stackchan::agent_profile {

/** v1.0.0-custom */
inline constexpr const char* kVersion = "1.0.0";

enum class ProfileId {
    Cloud = 0,
    LocalOllama,
    LocalCopilot,
};

struct ProfileDescriptor {
    ProfileId id;
    const char* nvs_id;
    const char* label_en;
    const char* label_ja;
    const char* default_ota_url;
};

inline constexpr ProfileDescriptor kProfiles[] = {
    {ProfileId::Cloud, "cloud", "Official Cloud", "公式クラウド", "https://api.tenclass.net/xiaozhi/ota/"},
    {ProfileId::LocalOllama, "local_ollama", "Home Ollama LLM", "自宅 Ollama LLM",
     "http://192.168.10.200:8003/xiaozhi/ota/"},
    {ProfileId::LocalCopilot, "local_copilot", "Home GitHub Copilot", "自宅 Copilot",
     "http://192.168.10.200:8013/xiaozhi/ota/"},
};

/** NVS 未設定時の既定プロファイル（自宅 homelab 運用） */
inline constexpr ProfileId kDefaultProfile = ProfileId::LocalOllama;

inline constexpr size_t kProfileCount = sizeof(kProfiles) / sizeof(kProfiles[0]);

ProfileId GetActiveProfile();
void SetActiveProfile(ProfileId profile);

/** Resolved OTA URL for the given profile (custom NVS override or default). */
std::string GetOtaUrl(ProfileId profile);

/** Persist custom OTA URL for local profiles (ignored for Cloud). */
void SetCustomOtaUrl(ProfileId profile, std::string_view url);

/** Write wifi:ota_url and optionally run OTA check to refresh websocket NVS. */
bool ApplyProfile(ProfileId profile, bool run_ota_check);

const ProfileDescriptor* FindDescriptor(ProfileId profile);
const ProfileDescriptor* FindDescriptorByNvsId(std::string_view nvs_id);

}  // namespace stackchan::agent_profile
