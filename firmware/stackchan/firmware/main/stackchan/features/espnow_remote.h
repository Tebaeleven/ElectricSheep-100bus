/*

 * StackChan custom: bundled ESP-NOW joystick remote (receiver).

 * SPDX-License-Identifier: MIT

 */

#pragma once



#include <cstdint>

#include <vector>



namespace stackchan::features {



void InitEspNowRemote();



bool IsEspNowRemoteEnabled();

void SetEspNowRemoteEnabled(bool enabled);



/** Start/stop coexist-mode ESP-NOW for agent (respects NVS toggle). */

void SyncEspNowRemoteAgent();



/** Avatar mode: always-on receiver after Wi-Fi is up. */

void StartEspNowRemoteAvatar();

void StopEspNowRemoteAvatar();



/** Drain queued packets (agent update loop). */

void UpdateEspNowRemote();



/** Parse 8-byte motion packet; returns true if handled. */

bool HandleEspNowPacket(const std::vector<uint8_t>& data);



int GetEspNowReceiverId();

void SetEspNowReceiverId(int id);



}  // namespace stackchan::features

