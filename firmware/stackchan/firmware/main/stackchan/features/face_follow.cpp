/*
 * SPDX-License-Identifier: MIT
 */
#include "face_follow.h"

#include "agent_status.h"
#include "feature_settings.h"

#include <board.h>
#include <cJSON.h>
#include <cmath>
#include <hal/board/hal_bridge.h>
#include <hal/hal.h>
#include <mooncake_log.h>
#include <stackchan/addons/addon_servo_guard.h>
#include <stackchan/agent_profile/agent_profile.h>
#include <stackchan/stackchan.h>
#include <smooth_ui_toolkit.hpp>

static const std::string_view _tag = "FaceFollow";

namespace stackchan::features {

namespace {

enum class FollowPhase {
    Scanning,
    Tracking,
};

constexpr uint32_t kUpdateMs           = 120;
constexpr uint32_t kHomelabDetectMs    = 380;
constexpr uint32_t kDeviceDetectMs     = 420;
constexpr uint32_t kTrackLostMs        = 1600;
constexpr float kScanPitchY            = 0.38f;   // ~45 deg up for easier face pickup
constexpr float kScanYawMin            = -0.55f;
constexpr float kScanYawMax            = 0.55f;
constexpr float kScanYawStep           = 0.035f;
constexpr int kScanMoveSpeed           = 85;
constexpr int kTrackMoveSpeed          = 110;
constexpr float kSmoothAlpha           = 0.18f;
constexpr float kMaxStepNorm           = 0.12f;
constexpr float kOutlierNorm           = 0.50f;
constexpr float kMinApplyDelta         = 0.015f;

FollowPhase g_phase            = FollowPhase::Scanning;
float g_target_x               = 0.0f;
float g_target_y               = kScanPitchY;
float g_filtered_x             = 0.0f;
float g_filtered_y             = kScanPitchY;
float g_scan_yaw               = kScanYawMin;
int g_scan_direction           = 1;
uint32_t g_last_update_ms      = 0;
uint32_t g_last_detect_ms      = 0;
uint32_t g_last_face_seen_ms   = 0;
bool g_filter_initialized      = false;

std::string BuildHomelabFaceTrackUrl()
{
    using stackchan::agent_profile::GetActiveProfile;
    using stackchan::agent_profile::GetOtaUrl;

    const std::string ota = GetOtaUrl(GetActiveProfile());
    if (ota.empty()) {
        return {};
    }

    const auto scheme_pos = ota.find("://");
    if (scheme_pos == std::string::npos) {
        return {};
    }
    const auto host_start = scheme_pos + 3;
    const auto path_pos   = ota.find('/', host_start);
    if (path_pos == std::string::npos) {
        return {};
    }

    const std::string scheme           = ota.substr(0, scheme_pos + 3);
    const std::string host_with_port   = ota.substr(host_start, path_pos - host_start);
    const auto port_pos                = host_with_port.rfind(':');
    const std::string host_ip =
        port_pos == std::string::npos ? host_with_port : host_with_port.substr(0, port_pos);

    return scheme + host_ip + ":8020/stackchan/face_track";
}

bool ParseFaceTrackJson(const std::string& body, float& out_x, float& out_y)
{
    cJSON* root = cJSON_Parse(body.c_str());
    if (!root) {
        return false;
    }

    const cJSON* found = cJSON_GetObjectItem(root, "found");
    if (!cJSON_IsBool(found) || cJSON_IsFalse(found)) {
        cJSON_Delete(root);
        return false;
    }

    const cJSON* x = cJSON_GetObjectItem(root, "x");
    const cJSON* y = cJSON_GetObjectItem(root, "y");
    if (!cJSON_IsNumber(x) || !cJSON_IsNumber(y)) {
        cJSON_Delete(root);
        return false;
    }

    out_x = static_cast<float>(x->valuedouble);
    out_y = static_cast<float>(y->valuedouble);
    cJSON_Delete(root);
    return true;
}

bool RequestHomelabFaceTarget(float& out_x, float& out_y)
{
    auto* camera = hal_bridge::board_get_camera();
    if (!camera) {
        return false;
    }
    if (!camera->Capture()) {
        return false;
    }

    const std::string url = BuildHomelabFaceTrackUrl();
    if (url.empty()) {
        return false;
    }

    try {
        camera->SetExplainUrl(url, "");
        const std::string response = camera->Explain("face_track");
        return ParseFaceTrackJson(response, out_x, out_y);
    } catch (...) {
        return false;
    }
}

float ClampNorm(float value)
{
    if (value < -1.0f) {
        return -1.0f;
    }
    if (value > 1.0f) {
        return 1.0f;
    }
    return value;
}

float YawToNormalized(int yaw_angle)
{
    auto& motion = GetStackChan().motion();
    const auto limit = motion.yawServo().getAngleLimit();
    return uitk::map_range(static_cast<float>(yaw_angle),
                           static_cast<float>(limit.x),
                           static_cast<float>(limit.y),
                           -1.0f,
                           1.0f);
}

float PitchToNormalized(int pitch_angle)
{
    auto& motion = GetStackChan().motion();
    const auto limit = motion.pitchServo().getAngleLimit();
    return uitk::map_range(static_cast<float>(pitch_angle),
                           static_cast<float>(limit.x),
                           static_cast<float>(limit.y),
                           -1.0f,
                           1.0f);
}

void ResetToScanning()
{
    g_phase              = FollowPhase::Scanning;
    g_scan_yaw           = kScanYawMin;
    g_scan_direction     = 1;
    g_target_x           = kScanYawMin;
    g_target_y           = kScanPitchY;
    g_filtered_x         = kScanYawMin;
    g_filtered_y         = kScanPitchY;
    g_filter_initialized = false;
    g_last_detect_ms     = 0;
    g_last_face_seen_ms  = 0;
}

bool CanDetectFace(FeatureRunMode mode)
{
    if (mode == FeatureRunMode::Homelab) {
        return IsHomelabAgentProfileActive();
    }
    // Device mode is intentionally local-only (no server / no cloud).
    return false;
}

bool TryDetectFace(FeatureRunMode mode, float& out_x, float& out_y)
{
    if (!CanDetectFace(mode)) {
        return false;
    }
    return RequestHomelabFaceTarget(out_x, out_y);
}

void UpdateFilteredTarget(float x, float y, bool reset_filter)
{
    if (reset_filter || !g_filter_initialized) {
        g_filtered_x         = x;
        g_filtered_y         = y;
        g_filter_initialized = true;
        return;
    }

    g_filtered_x += (x - g_filtered_x) * kSmoothAlpha;
    g_filtered_y += (y - g_filtered_y) * kSmoothAlpha;
}

float LimitStep(float current, float target, float max_step)
{
    const float delta = target - current;
    if (delta > max_step) {
        return current + max_step;
    }
    if (delta < -max_step) {
        return current - max_step;
    }
    return target;
}

void ApplyHeadTarget(float x, float y, int speed)
{
    auto& motion = GetStackChan().motion();
    if (stackchan::addons::ShouldHoldMotion() || motion.isModifyLocked()) {
        return;
    }

    const float current_x = YawToNormalized(motion.getCurrentYawAngle());
    const float current_y = PitchToNormalized(motion.getCurrentPitchAngle());

    const float raw_dx = x - current_x;
    const float raw_dy = y - current_y;
    const float raw_dist = std::sqrt(raw_dx * raw_dx + raw_dy * raw_dy);
    if (raw_dist < kMinApplyDelta) {
        return;
    }

    if (g_phase == FollowPhase::Tracking && raw_dist > kOutlierNorm) {
        mclog::tagWarn(_tag, "reject outlier target dx={:.2f} dy={:.2f}", raw_dx, raw_dy);
        ResetToScanning();
        return;
    }

    x = LimitStep(current_x, x, kMaxStepNorm);
    y = LimitStep(current_y, y, kMaxStepNorm);

    const float step_dx = x - current_x;
    const float step_dy = y - current_y;
    const float step_dist = std::sqrt(step_dx * step_dx + step_dy * step_dy);

    int move_speed = speed;
    if (step_dist > 0.35f) {
        move_speed = std::min(speed, 90);
    } else if (step_dist > 0.18f) {
        move_speed = std::min(speed, 105);
    }

    stackchan::addons::BeginUserDirectedMotion();
    motion.lookAtNormalized(x, y, move_speed);
    stackchan::addons::EndUserDirectedMotion();
}

void AdvanceScanTarget()
{
    g_scan_yaw += static_cast<float>(g_scan_direction) * kScanYawStep;
    if (g_scan_yaw >= kScanYawMax) {
        g_scan_yaw       = kScanYawMax;
        g_scan_direction = -1;
    } else if (g_scan_yaw <= kScanYawMin) {
        g_scan_yaw       = kScanYawMin;
        g_scan_direction = 1;
    }

    g_target_x = g_scan_yaw;
    g_target_y = kScanPitchY;
}

void UpdateScanning(FeatureRunMode mode, uint32_t now)
{
    AdvanceScanTarget();
    UpdateFilteredTarget(g_target_x, g_target_y, false);
    ApplyHeadTarget(g_filtered_x, g_filtered_y, kScanMoveSpeed);

    const uint32_t detect_interval =
        mode == FeatureRunMode::Homelab ? kHomelabDetectMs : kDeviceDetectMs;
    if (now - g_last_detect_ms < detect_interval) {
        return;
    }
    g_last_detect_ms = now;

    float face_x = 0.0f;
    float face_y = 0.0f;
    if (!TryDetectFace(mode, face_x, face_y)) {
        return;
    }

    face_x = ClampNorm(face_x);
    face_y = ClampNorm(face_y);

    g_phase            = FollowPhase::Tracking;
    g_target_x         = face_x;
    g_target_y         = face_y;
    g_last_face_seen_ms = now;
    UpdateFilteredTarget(face_x, face_y, true);
    mclog::tagInfo(_tag, "face found x={:.2f} y={:.2f}", face_x, face_y);
}

void UpdateTracking(FeatureRunMode mode, uint32_t now)
{
    const uint32_t detect_interval =
        mode == FeatureRunMode::Homelab ? kHomelabDetectMs : kDeviceDetectMs;
    if (now - g_last_detect_ms >= detect_interval) {
        g_last_detect_ms = now;

        float face_x = 0.0f;
        float face_y = 0.0f;
        if (TryDetectFace(mode, face_x, face_y)) {
            face_x = ClampNorm(face_x);
            face_y = ClampNorm(face_y);

            const float dx = face_x - g_target_x;
            const float dy = face_y - g_target_y;
            if (std::sqrt(dx * dx + dy * dy) <= kOutlierNorm) {
                g_target_x         = face_x;
                g_target_y         = face_y;
                g_last_face_seen_ms = now;
            }
        }
    }

    if (now - g_last_face_seen_ms > kTrackLostMs) {
        mclog::tagInfo(_tag, "face lost -> resume scan");
        ResetToScanning();
        UpdateFilteredTarget(g_target_x, g_target_y, true);
        ApplyHeadTarget(g_filtered_x, g_filtered_y, kScanMoveSpeed);
        return;
    }

    UpdateFilteredTarget(g_target_x, g_target_y, false);
    ApplyHeadTarget(g_filtered_x, g_filtered_y, kTrackMoveSpeed);
}

}  // namespace

void InitFaceFollow()
{
    g_last_update_ms = 0;
    ResetToScanning();
}

void UpdateFaceFollow()
{
    if (GetFaceFollowMode() == FeatureRunMode::Off) {
        return;
    }
    if (!IsConversationActive()) {
        if (g_phase != FollowPhase::Scanning || g_filter_initialized) {
            ResetToScanning();
        }
        return;
    }
    if (!GetStackChan().hasAvatar()) {
        return;
    }

    const uint32_t now = GetHAL().millis();
    if (now - g_last_update_ms < kUpdateMs) {
        return;
    }
    g_last_update_ms = now;

    const FeatureRunMode mode = GetFaceFollowMode();
    if (g_phase == FollowPhase::Scanning) {
        UpdateScanning(mode, now);
    } else {
        UpdateTracking(mode, now);
    }
}

}  // namespace stackchan::features
