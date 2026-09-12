/*
 * SPDX-License-Identifier: MIT
 */
#include "music_dance.h"

#include "agent_status.h"
#include "feature_settings.h"

#include <algorithm>
#include <cmath>
#include <vector>
#include <hal/hal.h>
#include <mooncake_log.h>
#include <stackchan/addons/addon_servo_guard.h>
#include <stackchan/modifiers/dance.h>
#include <stackchan/stackchan.h>

static const std::string_view _tag = "MusicDance";

namespace stackchan::features {

namespace {

constexpr uint32_t kSampleIntervalMs   = 180;
constexpr uint32_t kMusicHoldMsArmed   = 900;
constexpr uint32_t kSilenceStopMs      = 1800;
constexpr uint32_t kRestartCooldownMs  = 700;
constexpr float kNoiseFollowAlpha      = 0.08f;
constexpr int kThresholdFloor          = 280;
constexpr int kThresholdOffset         = 180;

int g_dance_modifier_id     = -1;
uint32_t g_last_sample_ms     = 0;
uint32_t g_music_above_since  = 0;
uint32_t g_last_dance_start_ms = 0;
uint32_t g_music_like_until_ms = 0;
float g_noise_floor            = 0.0f;

int ComputeMicLevel()
{
    std::vector<int16_t> samples;
    GetHAL().getMicWaveformFrame(samples);
    if (samples.empty()) {
        return 0;
    }

    int64_t sum = 0;
    for (int16_t sample : samples) {
        sum += std::abs(static_cast<int32_t>(sample));
    }
    return static_cast<int>(sum / static_cast<int64_t>(samples.size()));
}

int ComputeDynamicThreshold()
{
    const int base = static_cast<int>(g_noise_floor) + kThresholdOffset;
    return std::max(kThresholdFloor, base);
}

void StopDance()
{
    if (g_dance_modifier_id < 0) {
        return;
    }
    GetStackChan().removeModifier(g_dance_modifier_id);
    g_dance_modifier_id = -1;
}

void StartDance()
{
    if (g_dance_modifier_id >= 0) {
        return;
    }
    if (stackchan::addons::ShouldHoldMotion()) {
        return;
    }
    if (!GetStackChan().hasAvatar()) {
        return;
    }

    g_dance_modifier_id = GetStackChan().addModifier(
        std::make_unique<stackchan::DanceModifier>(stackchan::DanceModifier::Gentle));
    g_last_dance_start_ms = GetHAL().millis();
    mclog::tagInfo(_tag, "gentle dance started");
}

}  // namespace

void InitMusicDance()
{
    StopDance();
    g_last_sample_ms      = 0;
    g_music_above_since   = 0;
    g_last_dance_start_ms = 0;
    g_music_like_until_ms = 0;
    g_noise_floor         = 0.0f;
}

void UpdateMusicDance()
{
    const FeatureRunMode mode = GetMusicDanceMode();
    if (mode == FeatureRunMode::Off) {
        StopDance();
        return;
    }

    if (!IsConversationActive()) {
        StopDance();
        g_music_above_since = 0;
        return;
    }

    const uint32_t now = GetHAL().millis();
    if (now - g_last_sample_ms < kSampleIntervalMs) {
        return;
    }
    g_last_sample_ms = now;

    // Homelab mode will use server-side detection later; v1 uses on-device mic for both.
    (void)mode;

    if (g_dance_modifier_id >= 0 && GetStackChan().getModifier(g_dance_modifier_id) == nullptr) {
        g_dance_modifier_id = -1;
    }

    const int level = ComputeMicLevel();
    if (g_noise_floor <= 1.0f) {
        g_noise_floor = static_cast<float>(level);
    } else {
        g_noise_floor += (static_cast<float>(level) - g_noise_floor) * kNoiseFollowAlpha;
    }

    const int dynamic_threshold = ComputeDynamicThreshold();
    const bool music_like       = level >= dynamic_threshold;
    if (music_like) {
        if (g_music_above_since == 0) {
            g_music_above_since = now;
        }
        g_music_like_until_ms = now + kSilenceStopMs;
    } else {
        if (now > g_music_like_until_ms) {
            g_music_above_since = 0;
        }
    }

    if (g_dance_modifier_id >= 0 && now > g_music_like_until_ms) {
        StopDance();
    }

    if (g_dance_modifier_id >= 0 || !music_like) {
        return;
    }

    if (now - g_last_dance_start_ms < kRestartCooldownMs) {
        return;
    }

    const uint32_t hold_ms = kMusicHoldMsArmed;
    if (g_music_above_since != 0 && now - g_music_above_since >= hold_ms) {
        StartDance();
    }
}

}  // namespace stackchan::features
