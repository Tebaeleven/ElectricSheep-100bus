/*
 * StackChan custom layer implementation.
 * SPDX-License-Identifier: MIT
 */
#include "custom_integration.h"

#include "sdkconfig.h"
#include "custom_ota.h"

#if CONFIG_SC_CUSTOM_LAYER
#include "obake/obake_config.h"
#include "obake/obake_runtime.h"
#include "obake/obake_robot_ws.h"
#endif

#if CONFIG_SC_CUSTOM_LAYER

#if CONFIG_SC_CUSTOM_ADDONS
#include <stackchan/addons/addon_panel.h>
#include <stackchan/addons/addon_setup_overlay.h>
#include <stackchan/addons/addon_servo_guard.h>
#endif

#if CONFIG_SC_CUSTOM_AGENT_PROFILE
#include <stackchan/agent_profile/agent_profile.h>
#endif

#include <stackchan/features/agent_status.h>

#if CONFIG_SC_CUSTOM_ESPNOW
#include <stackchan/features/espnow_remote.h>
#endif

#if CONFIG_SC_CUSTOM_FACE_FOLLOW
#include <stackchan/features/face_follow.h>
#endif

#include <stackchan/features/feature_settings.h>

#if CONFIG_SC_CUSTOM_MUSIC_DANCE
#include <stackchan/features/music_dance.h>
#endif

#if CONFIG_SC_CUSTOM_IR
#include <stackchan/ir/ir_catalog.h>
#endif

#include <hal/hal.h>
#include <esp_heap_caps.h>
#include <lvgl.h>
#include <mcp_server.h>
#include <mooncake_log.h>

#endif  // CONFIG_SC_CUSTOM_LAYER

static const std::string_view _tag = "Custom";

namespace stackchan::custom {

static bool s_custom_session = false;
static bool s_custom_runtime_started = false;

#if CONFIG_SC_CUSTOM_LAYER
static McpServer* s_mcp_server = nullptr;

static void RegisterCustomMcpTools(McpServer& mcp_server)
{
    mcp_server.AddTool(
        "self.custom.check_firmware_update",
        "Check WinApp / LAN firmware OTA and install if a newer custom firmware is published.",
        std::vector<Property>{},
        [](const PropertyList& properties) -> ReturnValue {
            (void)properties;
            const bool ok = CheckAndInstallFirmware([](std::string_view) {});
            return ok ? "ok" : "failed";
        });

#if CONFIG_SC_CUSTOM_IR
    mclog::tagInfo(_tag, "add home.send_ir tool");
    mcp_server.AddTool(
        "self.home.send_ir",
        "Send an infrared command to control home appliances. "
        "Devices: light, tv, aircon, speaker. "
        "Examples: tv/power, light/power, aircon/off, tv/vol_up. "
        "Use self.home.list_ir_catalog to see all actions.",
        PropertyList({Property("device", kPropertyTypeString, std::string("tv")),
                      Property("action", kPropertyTypeString, std::string("power"))}),
        [](const PropertyList& properties) -> ReturnValue {
            const std::string device = properties["device"].value<std::string>();
            const std::string action = properties["action"].value<std::string>();
            return stackchan::ir::SendAction(device, action);
        });

    mclog::tagInfo(_tag, "add home.list_ir_catalog tool");
    mcp_server.AddTool("self.home.list_ir_catalog",
                       "List available IR devices and action names as JSON.",
                       std::vector<Property>{},
                       [](const PropertyList& properties) -> ReturnValue {
                           (void)properties;
                           return stackchan::ir::ListCatalogJson();
                       });
#endif
}

static void StartCustomRuntime()
{
    if (s_custom_runtime_started) {
        return;
    }
    s_custom_runtime_started = true;

#if CONFIG_SC_CUSTOM_IR
    stackchan::ir::Init();
#endif
#if CONFIG_SC_CUSTOM_FACE_FOLLOW
    stackchan::features::InitFaceFollow();
#endif
#if CONFIG_SC_CUSTOM_MUSIC_DANCE
    stackchan::features::InitMusicDance();
#endif
#if CONFIG_SC_CUSTOM_ESPNOW
    stackchan::features::InitEspNowRemote();
#endif
    if (s_mcp_server != nullptr) {
        RegisterCustomMcpTools(*s_mcp_server);
    }
    mclog::tagInfo(_tag, "custom runtime started");
}
#endif

void EnterCustomSession()
{
    s_custom_session = true;
    mclog::tagInfo(_tag, "custom session on");
#if CONFIG_SC_CUSTOM_LAYER
    // GPIO2 をレーザーから解放してから PaHub I2C を開始（.ino の Ex_I2C 相当）
    GetHAL().setLaserEnabled(false);
    // UI ready が先に終わっていても HW を起動（OnXiaozhiUiReady は一度きりのため）
    stackchan::obake::RuntimeStart();
    // httpd / Media はここでは始めない（内部 DRAM 不足で httpd_start が落ちる）
    // 開始は OnXiaozhiUiReady → RobotWsStart のみ
#endif
}

void LeaveCustomSession()
{
    s_custom_session = false;
#if CONFIG_SC_CUSTOM_LAYER
    // ホーム／再起動前に httpd と HW を順序立てて止め、内部 DRAM 断片化・UAF を避ける
    mclog::tagInfo(_tag, "leave custom: before stop internal={} spiram={}",
                   static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)),
                   static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)));
    stackchan::obake::RobotWsStop();
    stackchan::obake::RuntimeStop();
    mclog::tagInfo(_tag, "leave custom: after stop internal={} spiram={}",
                   static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)),
                   static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)));
#endif
}

bool IsCustomSessionActive()
{
    return s_custom_session;
}

void OnHalInit()
{
    s_custom_session         = false;
    s_custom_runtime_started = false;
#if CONFIG_SC_CUSTOM_LAYER
    stackchan::obake::RobotWsStop();
    // 再 init 時は PaHub/目/ToF の hw だけ止める（口 UI は破棄しない）
    stackchan::obake::RuntimeStop();
    stackchan::features::InitFeatureSettings();
    mclog::tagInfo(_tag, "HAL custom init (session off until Custom app)");
#endif
}

void OnXiaozhiUiReady()
{
#if CONFIG_SC_CUSTOM_LAYER
    if (!IsCustomSessionActive()) {
        mclog::tagInfo(_tag, "xiaozhi UI ready (official agent — no addons)");
        return;
    }
    StartCustomRuntime();
    // CUSTOM 時のみおばけ顔（両目・ToF・口）を起動
    stackchan::obake::RuntimeStart();
    // httpd はここから遅延起動（EnterCustomSession では呼ばない）
    stackchan::obake::RobotWsStart();
#if CONFIG_SC_CUSTOM_ADDONS
    stackchan::addons::create_addon_panel(lv_screen_active());
#endif
#if CONFIG_SC_CUSTOM_ESPNOW
    stackchan::features::SyncEspNowRemoteAgent();
#endif
    mclog::tagInfo(_tag, "addon panel created (custom session)");
#endif
}

void OnUiFrameUpdate()
{
#if CONFIG_SC_CUSTOM_LAYER
    if (!IsCustomSessionActive()) {
        return;
    }
    stackchan::obake::RuntimeOnUiFrame();
#if CONFIG_SC_CUSTOM_ADDONS
    stackchan::addons::update_addon_setup_overlay();
    stackchan::addons::update_addon_panel();
#endif
#endif
}

void OnStackChanPreUpdate()
{
#if CONFIG_SC_CUSTOM_LAYER
    if (!IsCustomSessionActive()) {
        return;
    }
    stackchan::obake::RuntimeOnPreUpdate();
    stackchan::obake::RobotWsOnPreUpdate();
#if CONFIG_SC_CUSTOM_ADDONS
    stackchan::addons::update_addon_panel_gesture();
    const bool addons_ui_active = stackchan::addons::is_addon_ui_modal_active();
    stackchan::addons::SyncServoPolicy(addons_ui_active);
#endif
#if CONFIG_SC_CUSTOM_ESPNOW
    stackchan::features::UpdateEspNowRemote();
#endif
#if CONFIG_SC_CUSTOM_FACE_FOLLOW
    if (stackchan::features::GetFaceFollowMode() != stackchan::features::FeatureRunMode::Off) {
        stackchan::features::UpdateFaceFollow();
    }
#endif
#if CONFIG_SC_CUSTOM_MUSIC_DANCE
    if (stackchan::features::GetMusicDanceMode() != stackchan::features::FeatureRunMode::Off) {
        stackchan::features::UpdateMusicDance();
    }
#endif
#endif
}

void OnAgentStatusChanged(const char* status)
{
#if CONFIG_SC_CUSTOM_LAYER
    if (!IsCustomSessionActive()) {
        (void)status;
        return;
    }
    stackchan::features::OnAgentStatusChanged(status);
#else
    (void)status;
#endif
}

void OnAgentProfileSync()
{
#if CONFIG_SC_CUSTOM_LAYER && CONFIG_SC_CUSTOM_AGENT_PROFILE
    if (!IsCustomSessionActive()) {
        return;
    }
    using stackchan::agent_profile::ApplyProfile;
    using stackchan::agent_profile::GetActiveProfile;
    using stackchan::agent_profile::ProfileId;

    const ProfileId profile = GetActiveProfile();
    // Wi-Fi 版チェックは止め、プロファイル URL 書き込みだけ行う（途中 OTA 差し替え防止）
    const bool run_ota =
        !stackchan::obake::kDisableWifiOtaVersionCheck && profile != ProfileId::Cloud;
    if (!ApplyProfile(profile, run_ota)) {
        mclog::tagWarn(_tag, "agent profile sync failed (OTA check={})", run_ota);
    }
#endif
}

void RegisterMcpTools(McpServer& mcp_server)
{
#if CONFIG_SC_CUSTOM_LAYER
    s_mcp_server = &mcp_server;
#else
    (void)mcp_server;
#endif
}

bool ShouldHoldMotion()
{
#if CONFIG_SC_CUSTOM_LAYER && CONFIG_SC_CUSTOM_ADDONS
    // addon_servo_guard: 自動系は hold/modifyLock、サーバ指令は BeginUserDirectedMotion で通す
    return stackchan::addons::ShouldHoldMotion();
#else
    return false;
#endif
}

bool IsAddonUiModalActive()
{
#if CONFIG_SC_CUSTOM_LAYER && CONFIG_SC_CUSTOM_ADDONS
    if (!IsCustomSessionActive()) {
        return false;
    }
    return stackchan::addons::is_addon_ui_modal_active();
#else
    return false;
#endif
}

float GetIdleMotionFreqMultiplier()
{
#if CONFIG_SC_CUSTOM_LAYER && CONFIG_SC_CUSTOM_ADDONS
    if (!IsCustomSessionActive()) {
        return 1.0f;
    }
    return stackchan::addons::GetIdleMotionFreqMultiplier();
#else
    return 1.0f;
#endif
}

bool IsConversationActive()
{
#if CONFIG_SC_CUSTOM_LAYER
    if (!IsCustomSessionActive()) {
        return false;
    }
    return stackchan::features::IsConversationActive();
#else
    return false;
#endif
}

bool ShouldBlockAgentTap()
{
#if CONFIG_SC_CUSTOM_LAYER && CONFIG_SC_CUSTOM_ADDONS
    if (!IsCustomSessionActive()) {
        return false;
    }
    return stackchan::addons::blocks_agent_tap_to_talk();
#else
    return false;
#endif
}

void BeginUserDirectedMotion()
{
#if CONFIG_SC_CUSTOM_LAYER && CONFIG_SC_CUSTOM_ADDONS
    if (!IsCustomSessionActive()) {
        return;
    }
    stackchan::addons::BeginUserDirectedMotion();
#endif
}

void EndUserDirectedMotion()
{
#if CONFIG_SC_CUSTOM_LAYER && CONFIG_SC_CUSTOM_ADDONS
    if (!IsCustomSessionActive()) {
        return;
    }
    stackchan::addons::EndUserDirectedMotion();
#endif
}

}  // namespace stackchan::custom
