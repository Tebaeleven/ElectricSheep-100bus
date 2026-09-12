/*
 * StackChan custom layer — single hook surface for official HAL / MCP / network.
 * SPDX-License-Identifier: MIT
 */
#pragma once

class McpServer;

namespace stackchan::custom {

/** Custom launcher session: addons / extra MCP / homelab profile. Official Agent leaves this false. */
void EnterCustomSession();
void LeaveCustomSession();
bool IsCustomSessionActive();

/** Called from Hal::init() after lvgl_init(). */
void OnHalInit();

/** Called once when Xiaozhi UI is ready (with LVGL lock held). */
void OnXiaozhiUiReady();

/** Called each frame from the stackchan update task (with LVGL lock held). */
void OnUiFrameUpdate();

/** Called before GetStackChan().update() in the stackchan update task. */
void OnStackChanPreUpdate();

/** Called from StackChanAvatarDisplay::SetStatus when xiaozhi phase changes. */
void OnAgentStatusChanged(const char* status);

/** Homelab profile / OTA sync — Custom session only. */
void OnAgentProfileSync();

/** Register custom MCP tools (called from Hal::xiaozhi_mcp_init). */
void RegisterMcpTools(McpServer& mcp_server);

bool ShouldHoldMotion();
bool IsAddonUiModalActive();
float GetIdleMotionFreqMultiplier();
bool IsConversationActive();
bool ShouldBlockAgentTap();
void BeginUserDirectedMotion();
void EndUserDirectedMotion();

}  // namespace stackchan::custom
