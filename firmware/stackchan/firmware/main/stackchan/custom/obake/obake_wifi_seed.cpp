/*
 * gitignored な wifi_credentials.local.h があるときだけブート時に NVS へ SSID を注入する。
 * ElectricSheep 等の公開同期には local ヘッダを含めないこと。
 */
#include "obake_wifi_seed.h"

#include <esp_log.h>
#include <ssid_manager.h>

#if __has_include("wifi_credentials.local.h")
#include "wifi_credentials.local.h"
#define OBAKE_HAVE_WIFI_CREDENTIALS_LOCAL 1
#endif
// local が無い公開ビルドでは OBAKE_HAVE_WIFI_CREDENTIALS_LOCAL は未定義のまま

namespace stackchan {
namespace obake {

static const char* TAG = "obake_wifi_seed";

void ApplyLocalWifiCredentialsIfPresent()
{
#ifdef OBAKE_HAVE_WIFI_CREDENTIALS_LOCAL
#ifndef OBAKE_WIFI_SSID
#error "wifi_credentials.local.h に OBAKE_WIFI_SSID が必要です"
#endif
#ifndef OBAKE_WIFI_PASSWORD
#error "wifi_credentials.local.h に OBAKE_WIFI_PASSWORD が必要です"
#endif
    // 先頭に追加／既存同 SSID は上書き。フル NVS erase せず Wi-Fi だけ更新する
    SsidManager::GetInstance().AddSsid(OBAKE_WIFI_SSID, OBAKE_WIFI_PASSWORD);
    ESP_LOGI(TAG, "seeded local Wi-Fi SSID into NVS: %s", OBAKE_WIFI_SSID);
#else
    ESP_LOGI(TAG, "no wifi_credentials.local.h — skip NVS seed");
#endif
}

}  // namespace obake
}  // namespace stackchan
