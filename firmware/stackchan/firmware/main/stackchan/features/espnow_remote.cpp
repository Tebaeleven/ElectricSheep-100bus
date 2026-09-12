/*

 * SPDX-License-Identifier: MIT

 */

#include "espnow_remote.h"



#include <algorithm>

#include <deque>

#include <mutex>



#include <hal/hal.h>

#include <mooncake_log.h>

#include <settings.h>

#include <stackchan/addons/addon_servo_guard.h>

#include <stackchan/stackchan.h>



static const std::string_view _tag = "EspNowRemote";



namespace stackchan::features {



namespace {



constexpr std::string_view kNamespace      = "addon";

constexpr std::string_view kEnabledKey      = "espnow_remote";

constexpr std::string_view kReceiverIdKey   = "espnow_receiver_id";



bool g_enabled_loaded   = false;

bool g_enabled          = false;

int g_receiver_id       = 1;

bool g_avatar_active    = false;

bool g_signal_connected = false;



std::mutex g_queue_mutex;

std::deque<std::vector<uint8_t>> g_packet_queue;



int LoadReceiverId()

{

    Settings settings(kNamespace.data(), false);

    int id = settings.GetInt(kReceiverIdKey.data(), 1);

    if (id < 1) {

        id = 1;

    }

    if (id > 254) {

        id = 254;

    }

    return id;

}



void SaveReceiverId(int id)

{

    Settings settings(kNamespace.data(), true);

    settings.SetInt(kReceiverIdKey.data(), id);

}



void EnsureSettingsLoaded()

{

    if (g_enabled_loaded) {

        return;

    }

    Settings settings(kNamespace.data(), false);

    g_enabled       = settings.GetInt(kEnabledKey.data(), 0) != 0;

    g_receiver_id   = LoadReceiverId();

    g_enabled_loaded = true;

}



void OnEspNowData(const std::vector<uint8_t>& data)

{

    if (!g_avatar_active && !g_enabled) {

        return;

    }



    std::lock_guard<std::mutex> lock(g_queue_mutex);

    g_packet_queue.push_back(data);

}



void DrainQueue()

{

    std::deque<std::vector<uint8_t>> local;

    {

        std::lock_guard<std::mutex> lock(g_queue_mutex);

        local.swap(g_packet_queue);

    }



    for (const auto& packet : local) {

        HandleEspNowPacket(packet);

    }

}



}  // namespace



void InitEspNowRemote()

{

    EnsureSettingsLoaded();



    if (!g_signal_connected) {

        GetHAL().onEspNowData.connect(OnEspNowData);

        g_signal_connected = true;

    }



    mclog::tagInfo(_tag, "init (enabled={}, receiver_id={})", g_enabled, g_receiver_id);

}



bool IsEspNowRemoteEnabled()

{

    EnsureSettingsLoaded();

    return g_enabled;

}



void SetEspNowRemoteEnabled(bool enabled)

{

    EnsureSettingsLoaded();

    g_enabled = enabled;

    Settings settings(kNamespace.data(), true);

    settings.SetInt(kEnabledKey.data(), enabled ? 1 : 0);

    SyncEspNowRemoteAgent();

}



int GetEspNowReceiverId()

{

    EnsureSettingsLoaded();

    return g_receiver_id;

}



void SetEspNowReceiverId(int id)

{

    g_receiver_id = std::clamp(id, 1, 254);

    SaveReceiverId(g_receiver_id);

}



bool HandleEspNowPacket(const std::vector<uint8_t>& data)

{

    // [target-id][yaw lo][yaw hi][pitch lo][pitch hi][speed lo][speed hi][laser]

    if (data.size() < 8) {

        return false;

    }



    const uint8_t target_id = data[0];

    if (target_id != 0 && static_cast<int>(target_id) != g_receiver_id) {

        return false;

    }



    const int16_t yaw_angle =

        static_cast<int16_t>(static_cast<uint16_t>(data[1]) | (static_cast<uint16_t>(data[2]) << 8));

    const int16_t pitch_angle =

        static_cast<int16_t>(static_cast<uint16_t>(data[3]) | (static_cast<uint16_t>(data[4]) << 8));

    const int16_t speed =

        static_cast<int16_t>(static_cast<uint16_t>(data[5]) | (static_cast<uint16_t>(data[6]) << 8));

    const bool laser_enabled = (data[7] != 0);



    stackchan::addons::BeginUserDirectedMotion();

    auto& motion = GetStackChan().motion();

    motion.moveWithSpeed(yaw_angle, pitch_angle, speed > 0 ? speed : 600);

    stackchan::addons::EndUserDirectedMotion();



    GetHAL().setLaserEnabled(laser_enabled);

    return true;

}



void SyncEspNowRemoteAgent()

{

    EnsureSettingsLoaded();

    if (g_avatar_active) {

        return;

    }



    if (g_enabled) {

        GetHAL().startEspNowCoexist(0);

        mclog::tagInfo(_tag, "agent ESP-NOW receiver ON");

    } else {

        GetHAL().stopEspNow();

        mclog::tagInfo(_tag, "agent ESP-NOW receiver OFF");

    }

}



void StartEspNowRemoteAvatar()

{

    EnsureSettingsLoaded();

    g_avatar_active = true;

    GetHAL().startEspNowCoexist(0);

    mclog::tagInfo(_tag, "avatar ESP-NOW receiver started");

}



void StopEspNowRemoteAvatar()

{

    g_avatar_active = false;

    GetHAL().stopEspNow();

    {

        std::lock_guard<std::mutex> lock(g_queue_mutex);

        g_packet_queue.clear();

    }

    mclog::tagInfo(_tag, "avatar ESP-NOW receiver stopped");

}



void UpdateEspNowRemote()

{

    DrainQueue();

}



}  // namespace stackchan::features

