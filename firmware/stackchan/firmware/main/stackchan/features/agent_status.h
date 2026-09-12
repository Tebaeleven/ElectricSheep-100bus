/*
 * StackChan custom: xiaozhi conversation phase for interaction features.
 * SPDX-License-Identifier: MIT
 */
#pragma once

namespace stackchan::features {

enum class AgentPhase {
    Idle,
    Listening,
    Speaking,
    Other,
};

void OnAgentStatusChanged(const char* status);

AgentPhase GetAgentPhase();

/** True while user is in an active voice conversation (listening or speaking). */
bool IsConversationActive();

/** Mark that the user recently talked; used to arm music-dance detection. */
void NotifyConversationEnded();

bool IsMusicDanceArmed();

}  // namespace stackchan::features
