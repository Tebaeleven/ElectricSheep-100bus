/*
 * CUSTOM 自動起動: 電源投入（冷起動）の1回だけ許可。帰宅→warm reboot では抑止。
 */
#include "obake_autocustom.h"

#include "obake_config.h"

#include <esp_log.h>
#include <esp_system.h>
#include <settings.h>

namespace stackchan::obake {
namespace {

const char* TAG = "obake_autocustom";
constexpr const char* kNvsNs = "obake";
/** 1=帰宅済み。次の冷起動までランチャー自動 CUSTOM をしない */
constexpr const char* kNvsSuppressKey = "no_auto_cust";

bool s_opened_this_runtime = false;

bool IsColdBootReset()
{
    const esp_reset_reason_t r = esp_reset_reason();
    // 電源 ON / リセットピン / ブラウンアウトのみ「初期起動」とみなす
    return r == ESP_RST_POWERON || r == ESP_RST_EXT || r == ESP_RST_BROWNOUT;
}

bool LoadSuppress()
{
    Settings settings(kNvsNs, false);
    return settings.GetInt(kNvsSuppressKey, 0) != 0;
}

void SaveSuppress(bool on)
{
    Settings settings(kNvsNs, true);
    settings.SetInt(kNvsSuppressKey, on ? 1 : 0);
}

}  // namespace

void AutocustomOnBoot()
{
    if (IsColdBootReset()) {
        if (LoadSuppress()) {
            SaveSuppress(false);
            ESP_LOGI(TAG, "cold boot (rst=%d): clear autocustom suppress",
                     static_cast<int>(esp_reset_reason()));
        } else {
            ESP_LOGI(TAG, "cold boot (rst=%d): autocustom allowed",
                     static_cast<int>(esp_reset_reason()));
        }
    } else {
        ESP_LOGI(TAG, "warm/other boot (rst=%d): suppress=%d", static_cast<int>(esp_reset_reason()),
                 LoadSuppress() ? 1 : 0);
    }
}

bool AutocustomShouldOpen()
{
    if (kObakeAutoCustom == 0) {
        return false;
    }
    if (s_opened_this_runtime) {
        return false;
    }
    if (LoadSuppress()) {
        ESP_LOGI(TAG, "skip autostart: NVS suppress until cold boot");
        return false;
    }
    return true;
}

void AutocustomMarkOpened()
{
    s_opened_this_runtime = true;
}

void AutocustomSuppressUntilColdBoot()
{
    SaveSuppress(true);
    s_opened_this_runtime = true;
    ESP_LOGI(TAG, "home leave: suppress autocustom until cold boot");
}

}  // namespace stackchan::obake
