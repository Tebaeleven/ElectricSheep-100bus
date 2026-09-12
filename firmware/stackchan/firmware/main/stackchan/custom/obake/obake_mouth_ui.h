/*
 * Custom 時の口 UI（白地 ∪/∩）＋距離表示。
 */
#pragma once

namespace stackchan::obake {

/** LVGL lock 保持中に呼ぶ */
void MouthUiCreate();
/** 通常は使わない。RuntimeStop からは呼ばず、呼んでも標準目口は戻さない */
void MouthUiDestroy();
void MouthUiUpdate();

}  // namespace stackchan::obake
