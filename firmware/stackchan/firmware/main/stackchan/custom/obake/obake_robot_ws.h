/*
 * Obake Robot / Media WebSocket。
 * 既定は端末サーバ（kMediaListenAsServer=1）。0 なら PC へのクライアント経路。
 * httpd は EnterCustomSession では始めず、OnXiaozhiUiReady → RobotWsStart のみ。
 *
 * 将来の双方向トランシーバ（v0.5.4 計画・実装は段階的）:
 * - 上行（実装済み寄り）: audio.chunk（PCM bin）、camera.frame（JPEG bin、one-shot）
 * - 下行（未実装・フック予約）: サーバ音声のスピーカ再生、サーバ経由ウェイク→既存 LED
 * - hand.set: グリッパではない。サーバ信号で首 yaw の open/close（度数は obake_config.h）。
 *   実装は HandleRobotJson + ServoRequestSetHeadAngles（大きな cpp 改修はメモリ作業と分離）
 * - ブラウザ簡易制御: GET http://<ip>:8765/ （光る/消す/開く/閉じる）
 *   POST /obake/led_on・/obake/led_off・/obake/hand_open・/obake/hand_close
 *   POST /obake/hand  body {"open":true|false}（Next.js 向け統一。応答に open を含む）
 *   WS TEXT {"type":"hand.set","open":true|false} → ack {"type":"ack","cmd":"hand.set","open":...}
 *   （httpd はキューのみ。LED/手は PreUpdate で drain。hand は WS hand.set と同じ yaw）
 * - 契約の正本メモはリポ根の 引き継ぎ.md「双方向トランシーバ」節
 * このヘッダに downlink API を足すときは、メモリ逼迫対策（home/PSRAM 作業）と衝突しないよう
 * 薄い宣言のみにし、本体は obake_robot_ws.cpp に後置する。
 */
#pragma once

namespace stackchan::obake {

/** CUSTOM + Xiaozhi UI ready 後に開始（Wi-Fi 待ち・httpd はタスク内） */
void RobotWsStart();

/** セッション終了で停止 */
void RobotWsStop();

/** PreUpdate: 制御キュー（LED/手）→ サーボ drain */
void RobotWsOnPreUpdate();

/*
 * --- 将来フック（宣言のみ・未実装）------------------------------------------
 * サーバ→端末のメディア／ウェイクを足すときの差し込み口。今は呼ばない。
 * 例（合意後）:
 *   void RobotWsOnServerAudioChunk(...);  // スピーカ下行
 *   void RobotWsOnServerWake();           // 外部ウェイク → Stack-chan LED 経路
 * ------------------------------------------------------------------------- */

}  // namespace stackchan::obake
