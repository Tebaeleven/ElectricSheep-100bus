/*
 * Obake Robot / Media WebSocket。
 * 既定は端末サーバ（kMediaListenAsServer=1）。0 なら PC へのクライアント経路。
 * httpd は EnterCustomSession では始めず、OnXiaozhiUiReady → RobotWsStart のみ。
 */
#pragma once

namespace stackchan::obake {

/** CUSTOM + Xiaozhi UI ready 後に開始（Wi-Fi 待ち・httpd はタスク内） */
void RobotWsStart();

/** セッション終了で停止 */
void RobotWsStop();

/** PreUpdate: サーボ drain など */
void RobotWsOnPreUpdate();

}  // namespace stackchan::obake
