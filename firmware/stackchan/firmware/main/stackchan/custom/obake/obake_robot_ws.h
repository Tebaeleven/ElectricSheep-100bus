/*
 * Obake Media WebSocket クライアント。
 * 端末はサーバにしない。Wi-Fi STA として
 * ws://<kMediaWsHost>:<port>/obake/media へ外向き接続する。
 */
#pragma once

namespace stackchan::obake {

/** CUSTOM + Xiaozhi ready 後に接続ループ開始 */
void RobotWsStart();

/** セッション終了で停止 */
void RobotWsStop();

/** PreUpdate: サーボ drain など */
void RobotWsOnPreUpdate();

}  // namespace stackchan::obake
