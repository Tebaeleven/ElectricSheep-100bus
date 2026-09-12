/*
 * 端末ローカルの Wi-Fi 資格情報を NVS に流し込む（UI 配網が使えないときの救済）。
 * 実パスワードは gitignored の wifi_credentials.local.h のみ。
 */
#pragma once

namespace stackchan {
namespace obake {

/** Hal::init（NVS 直後）および StartNetwork 直前で呼び、local ヘッダがあれば SsidManager へ書き込む */
void ApplyLocalWifiCredentialsIfPresent();

}  // namespace obake
}  // namespace stackchan
