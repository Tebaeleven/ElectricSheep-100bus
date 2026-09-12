/*
 * SPDX-License-Identifier: MIT
 */
#include "agent_status.h"

#include <assets/lang_config.h>
#include <cstring>
#include <hal/hal.h>

namespace stackchan::features {

namespace {

AgentPhase g_phase              = AgentPhase::Idle;
bool g_was_conversation_active  = false;
uint32_t g_music_armed_until_ms = 0;

constexpr uint32_t kMusicArmDurationMs = 180000;

}  // namespace

void OnAgentStatusChanged(const char* status)
{
    if (!status) {
        return;
    }

    const bool was_active = IsConversationActive();

    if (strcmp(status, Lang::Strings::LISTENING) == 0) {
        g_phase = AgentPhase::Listening;
    } else if (strcmp(status, Lang::Strings::SPEAKING) == 0) {
        g_phase = AgentPhase::Speaking;
    } else if (strcmp(status, Lang::Strings::STANDBY) == 0) {
        g_phase = AgentPhase::Idle;
    } else {
        g_phase = AgentPhase::Other;
    }

    const bool is_active = IsConversationActive();
    if (was_active && !is_active) {
        NotifyConversationEnded();
    }
    g_was_conversation_active = is_active;
}

AgentPhase GetAgentPhase()
{
    return g_phase;
}

bool IsConversationActive()
{
    return g_phase == AgentPhase::Listening || g_phase == AgentPhase::Speaking;
}

void NotifyConversationEnded()
{
    g_music_armed_until_ms = GetHAL().millis() + kMusicArmDurationMs;
}

bool IsMusicDanceArmed()
{
    return GetHAL().millis() < g_music_armed_until_ms;
}

}  // namespace stackchan::features
