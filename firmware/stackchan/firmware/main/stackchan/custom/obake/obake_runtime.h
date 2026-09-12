/*
 * Obake Custom ランタイム（セッション中のみ）。
 */
#pragma once

namespace stackchan::obake {

/** Custom セッションかつ Xiaozhi UI ready 時に呼ぶ（LVGL lock 内） */
void RuntimeStart();

/** 毎フレーム（LVGL lock 内） */
void RuntimeOnUiFrame();

/** ハードウェア tick は専用タスク。ここは no-op でもよい */
void RuntimeOnPreUpdate();

/** hw タスクと PaHub/目/ToF のみ停止。口 UI は残す */
void RuntimeStop();

}  // namespace stackchan::obake
