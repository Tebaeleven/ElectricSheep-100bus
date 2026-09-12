/*
 * StackChan custom: NVS settings for optional interaction features.
 * SPDX-License-Identifier: MIT
 */
#pragma once

#include <cstdint>

namespace stackchan::features {

/** OFF / on-device / homelab server */
enum class FeatureRunMode : uint8_t {
    Off     = 0,
    Device  = 1,
    Homelab = 2,
};

void InitFeatureSettings();

FeatureRunMode GetFaceFollowMode();
void SetFaceFollowMode(FeatureRunMode mode);

FeatureRunMode GetMusicDanceMode();
void SetMusicDanceMode(FeatureRunMode mode);

const char* FeatureRunModeLabel(FeatureRunMode mode);

/** True when active profile is Home Ollama or Home Copilot. */
bool IsHomelabAgentProfileActive();

}  // namespace stackchan::features
