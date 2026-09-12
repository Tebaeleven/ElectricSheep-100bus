# StackChan カスタム層（追加のみ）

公式ファームウェアへの干渉を最小にするため、カスタム機能はこのディレクトリと兄弟モジュールに集約します。

## モジュール構成

| パス | 役割 |
|------|------|
| `custom/custom_integration.*` | **唯一の公式接続面**（HAL から呼ばれる）。addon は Custom セッション時のみ |
| `custom/obake/` | CUSTOM 時のおばけ顔（PaHub・両目 OLED・ToF・口 UI）。サーボなし |
| `apps/app_custom/` | ランチャー先頭 CUSTOM（現行 Agent＋addon） |
| `addons/` | 右端スワイプ・アドオンパネル UI |
| `agent_profile/` | 会話バックエンド（OTA URL） |
| `ir/` | 赤外線カタログ・RMT 送信 |

## 公式ファイルへの変更（最小）

`firmware/patches/stackchan-custom-hal.patch` を `fetch_repos.py` 後に適用するか、手動で同等の 3 行を入れます。

- `hal/hal.cpp` … `OnHalInit` / `OnStackChanPreUpdate` / `OnAgentProfileSync` / `OnXiaozhiUiReady` / `OnUiFrameUpdate`
- `hal/hal_mcp.cpp` … `RegisterMcpTools` / サーボ MCP 委譲
- `hal/hal_network.cpp` … アバター経路では homelab OTA を呼ばない（公式 `startNetwork` と同じ）
- `hal/board/stackchan*.cc` … `ShouldBlockAgentTap` / `OnAgentStatusChanged`
- `stackchan/modifiers/*.h` … `custom::ShouldHoldMotion` 等の委譲
- `main/CMakeLists.txt` … `esp_driver_rmt`（IR 用 RMT ドライバ）

**設定アプリ（app_setup）のメニューは公式のまま**です。IR・AI 切替はアドオンパネルのみ。

## 公式アップデート時

1. `git merge upstream/main`（または fetch）
2. `firmware/patches/stackchan-custom-hal.patch` を再適用
3. `python fetch_repos.py`（xiaozhi はパッチのみ、本体は非改変推奨）
4. `idf.py build`

`stackchan/custom` 以下はマージ競合が起きにくい独立ツリーです。
