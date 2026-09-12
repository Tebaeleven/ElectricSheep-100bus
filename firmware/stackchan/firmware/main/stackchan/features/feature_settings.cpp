/*
 * SPDX-License-Identifier: MIT
 */
#include "feature_settings.h"

#include <settings.h>
#include <stackchan/agent_profile/agent_profile.h>

namespace stackchan::features {

namespace {

constexpr std::string_view kNamespace   = "addon";
constexpr std::string_view kFaceModeKey = "face_mode";
constexpr std::string_view kMusicModeKey = "music_mode";

FeatureRunMode g_face_mode  = FeatureRunMode::Off;
FeatureRunMode g_music_mode = FeatureRunMode::Off;
bool g_loaded               = false;

FeatureRunMode ClampMode(int value)
{
    if (value < 0 || value > 2) {
        return FeatureRunMode::Off;
    }
    return static_cast<FeatureRunMode>(value);
}

FeatureRunMode LoadMode(std::string_view key)
{
    Settings settings(kNamespace.data(), false);
    return ClampMode(settings.GetInt(key.data(), 0));
}

void SaveMode(std::string_view key, FeatureRunMode mode)
{
    Settings settings(kNamespace.data(), true);
    settings.SetInt(key.data(), static_cast<int>(mode));
}

void EnsureLoaded()
{
    if (g_loaded) {
        return;
    }
    g_face_mode  = LoadMode(kFaceModeKey);
    g_music_mode = LoadMode(kMusicModeKey);
    g_loaded     = true;
}

}  // namespace

void InitFeatureSettings()
{
    EnsureLoaded();
}

FeatureRunMode GetFaceFollowMode()
{
    EnsureLoaded();
    return g_face_mode;
}

void SetFaceFollowMode(FeatureRunMode mode)
{
    EnsureLoaded();
    g_face_mode = ClampMode(static_cast<int>(mode));
    SaveMode(kFaceModeKey, g_face_mode);
}

FeatureRunMode GetMusicDanceMode()
{
    EnsureLoaded();
    return g_music_mode;
}

void SetMusicDanceMode(FeatureRunMode mode)
{
    EnsureLoaded();
    g_music_mode = ClampMode(static_cast<int>(mode));
    SaveMode(kMusicModeKey, g_music_mode);
}

const char* FeatureRunModeLabel(FeatureRunMode mode)
{
    switch (mode) {
    case FeatureRunMode::Homelab:
        return "Home Server";
    case FeatureRunMode::Device:
        return "On Device";
    case FeatureRunMode::Off:
    default:
        return "OFF";
    }
}

bool IsHomelabAgentProfileActive()
{
    using stackchan::agent_profile::GetActiveProfile;
    using stackchan::agent_profile::ProfileId;
    const auto profile = GetActiveProfile();
    return profile == ProfileId::LocalOllama || profile == ProfileId::LocalCopilot;
}

}  // namespace stackchan::features
