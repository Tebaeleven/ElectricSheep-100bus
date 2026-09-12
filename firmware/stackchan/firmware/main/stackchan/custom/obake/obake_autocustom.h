/*
 * CUSTOM 自動起動の一度きり制御。
 * ホームは warm reboot するため RAM フラグだけでは足りず、NVS で電源投入まで抑止する。
 */
#pragma once

namespace stackchan::obake {

/** 起動直後に呼ぶ。冷起動なら抑止 NVS をクリア */
void AutocustomOnBoot();

/**
 * ランチャーが自動で CUSTOM を開いてよいか。
 * kObakeAutoCustom=0、または帰宅後抑止中、または同一ランタイムで既に自動済みなら false。
 */
bool AutocustomShouldOpen();

/** 自動オープンを実行したあと（同一ブート内の再入場防止） */
void AutocustomMarkOpened();

/**
 * ユーザーがホームへ戻ったとき。warm reboot 後も自動 CUSTOM しないよう NVS に抑止を残す。
 * 手動でランチャーから CUSTOM を開くことは妨げない。
 */
void AutocustomSuppressUntilColdBoot();

}  // namespace stackchan::obake
