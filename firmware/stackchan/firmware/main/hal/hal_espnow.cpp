/*
 * SPDX-FileCopyrightText: 2026 M5Stack Technology CO LTD
 *
 * SPDX-License-Identifier: MIT
 */
#include "hal.h"
#include <algorithm>
#include <mooncake_log.h>
#include <esp_wifi.h>
#include <esp_netif.h>
#include <esp_err.h>
#include <esp_system.h>
#include <esp_event.h>
#include <lwip/err.h>
#include <lwip/sys.h>
#include <time.h>
#include <sys/time.h>
#include <esp_sntp.h>
#include <esp_log.h>
#include <esp_mac.h>
#include <espnow.h>
#include <espnow_storage.h>
#include <espnow_utils.h>
#include <esp_check.h>

static const std::string_view _tag = "HAL-EspNow";

static EventGroupHandle_t s_wifi_event_group = NULL;
static const int WIFI_CONNECTED_BIT          = BIT0;
static const int WIFI_DISCONNECTED_BIT       = BIT1;
static const int WIFI_FAIL_BIT               = BIT2;
static const int WIFI_STARTED_BIT            = BIT3;

static bool s_espnow_running    = false;
static bool s_standalone_wifi   = false;

static void wifi_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data)
{
    const char* TAG = "WiFi";

    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        xEventGroupSetBits(s_wifi_event_group, WIFI_STARTED_BIT);
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupSetBits(s_wifi_event_group, WIFI_DISCONNECTED_BIT);
        xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*)event_data;
        ESP_LOGI(TAG, "got ip:" IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

static void _wifi_init_standalone(int channel = 1)
{
    mclog::tagInfo(_tag, "wifi init (standalone)");

    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_t* sta_netif = esp_netif_create_default_wifi_sta();
    assert(sta_netif);

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));

    if (!s_wifi_event_group) {
        s_wifi_event_group = xEventGroupCreate();
    }

    ESP_ERROR_CHECK(
        esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, nullptr, nullptr));
    ESP_ERROR_CHECK(
        esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, nullptr, nullptr));

    ESP_ERROR_CHECK(esp_wifi_start());

    channel = std::clamp(channel, 1, 13);
    mclog::tagInfo(_tag, "wifi channel set to {}", channel);

    ESP_ERROR_CHECK(esp_wifi_set_promiscuous(true));
    ESP_ERROR_CHECK(esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE));
    ESP_ERROR_CHECK(esp_wifi_set_promiscuous(false));
}

static esp_err_t _handle_espnow_received(uint8_t* src_addr, void* data, size_t size, wifi_pkt_rx_ctrl_t* rx_ctrl)
{
    const char* TAG = "EspNow";

    ESP_PARAM_CHECK(src_addr);
    ESP_PARAM_CHECK(data);
    ESP_PARAM_CHECK(size);
    ESP_PARAM_CHECK(rx_ctrl);

    static uint32_t count = 0;

    ESP_LOGI(TAG, "espnow_recv, <%" PRIu32 "> [" MACSTR "][%d][%d][%u]", count++, MAC2STR(src_addr), rx_ctrl->channel,
             rx_ctrl->rssi, static_cast<unsigned>(size));

    std::vector<uint8_t> received_data(static_cast<uint8_t*>(data), static_cast<uint8_t*>(data) + size);
    GetHAL().onEspNowData.emit(received_data);

    return ESP_OK;
}

static void _init_espnow_stack()
{
    espnow_config_t espnow_config = ESPNOW_INIT_CONFIG_DEFAULT();
    espnow_config.forward_enable         = false;
    espnow_config.forward_switch_channel = false;
    espnow_config.send_retry_num         = 5;
    espnow_config.receive_enable.forward = false;
    espnow_config.receive_enable.data    = true;

    espnow_init(&espnow_config);
    espnow_set_config_for_data_type(ESPNOW_DATA_TYPE_DATA, true, _handle_espnow_received);
}

static int _resolve_wifi_channel(int channel)
{
    if (channel > 0) {
        return std::clamp(channel, 1, 13);
    }

    uint8_t primary            = 0;
    wifi_second_chan_t second  = WIFI_SECOND_CHAN_NONE;
    if (esp_wifi_get_channel(&primary, &second) == ESP_OK && primary >= 1 && primary <= 13) {
        return static_cast<int>(primary);
    }
    return 1;
}

static void _lock_wifi_channel(int channel)
{
    mclog::tagInfo(_tag, "lock Wi-Fi channel to {}", channel);
    ESP_ERROR_CHECK(esp_wifi_set_promiscuous(true));
    ESP_ERROR_CHECK(esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE));
    ESP_ERROR_CHECK(esp_wifi_set_promiscuous(false));
}

void Hal::startEspNow(int channel)
{
    startEspNowStandalone(channel);
}

void Hal::startEspNowStandalone(int channel)
{
    if (s_espnow_running) {
        mclog::tagWarn(_tag, "ESP-NOW already running");
        return;
    }

    channel = std::clamp(channel, 1, 13);
    mclog::tagInfo(_tag, "start ESP-NOW standalone on channel {}", channel);

    _wifi_init_standalone(channel);
    _init_espnow_stack();

    s_espnow_running  = true;
    s_standalone_wifi = true;
    mclog::tagInfo(_tag, "factory mac: {}", getFactoryMacString());
}

void Hal::startEspNowCoexist(int channel)
{
    if (s_espnow_running) {
        mclog::tagInfo(_tag, "ESP-NOW coexist already active");
        return;
    }

    channel = _resolve_wifi_channel(channel);
    mclog::tagInfo(_tag, "start ESP-NOW coexist on channel {}", channel);

    _lock_wifi_channel(channel);
    _init_espnow_stack();

    s_espnow_running  = true;
    s_standalone_wifi = false;
    mclog::tagInfo(_tag, "factory mac: {}", getFactoryMacString());
}

void Hal::stopEspNow()
{
    if (!s_espnow_running) {
        return;
    }

    mclog::tagInfo(_tag, "stop ESP-NOW (standalone={})", s_standalone_wifi);
    espnow_set_config_for_data_type(ESPNOW_DATA_TYPE_DATA, false, nullptr);
    espnow_deinit();
    s_espnow_running  = false;
    s_standalone_wifi = false;
}

bool Hal::espNowSend(const std::vector<uint8_t>& data, const uint8_t* destAddr)
{
    mclog::tagInfo(_tag, "send data with size: {}", data.size());

    espnow_frame_head_t frame_head = ESPNOW_FRAME_CONFIG_DEFAULT();
    esp_err_t ret                  = ESP_FAIL;

    if (destAddr == nullptr) {
        ret = espnow_send(ESPNOW_DATA_TYPE_DATA, ESPNOW_ADDR_BROADCAST, data.data(), data.size(), &frame_head,
                          portMAX_DELAY);
    } else {
        ret = espnow_send(ESPNOW_DATA_TYPE_DATA, destAddr, data.data(), data.size(), &frame_head, portMAX_DELAY);
    }

    if (ret != ESP_OK) {
        mclog::tagError(_tag, "send failed: {}", esp_err_to_name(ret));
        return false;
    }
    return true;
}

#include <driver/gpio.h>
#include <stackchan/custom/custom_integration.h>

// Port.A SDA=GPIO2。Obake PaHub 使用中判定（obake_pahub.cpp の C リンケージ）
extern "C" bool stackchan_obake_pahub_port_a_in_use();

void Hal::setLaserEnabled(bool enabled)
{
    static bool laser_enabled = false;
    static bool is_inited     = false;

    const gpio_num_t laser_pin = GPIO_NUM_2;

    // CUSTOM / PaHub 中は GPIO2 を I2C(SDA) に返す。掴んだまま skip すると Port.A が死ぬ
    if (stackchan::custom::IsCustomSessionActive() || stackchan_obake_pahub_port_a_in_use()) {
        if (is_inited || laser_enabled) {
            gpio_reset_pin(laser_pin);
            is_inited     = false;
            laser_enabled = false;
            mclog::tagInfo(_tag, "laser released for Obake Port.A (GPIO2)");
        }
        return;
    }

    if (laser_enabled == enabled) {
        return;
    }

    if (!is_inited) {
        gpio_reset_pin(laser_pin);
        gpio_set_direction(laser_pin, GPIO_MODE_OUTPUT);
        gpio_set_pull_mode(laser_pin, GPIO_PULLUP_ONLY);
        is_inited = true;
    }

    mclog::tagInfo(_tag, "set laser {}", enabled ? "enabled" : "disabled");

    if (enabled) {
        gpio_set_level(laser_pin, 1);
    } else {
        gpio_set_level(laser_pin, 0);
    }
    laser_enabled = enabled;
}
