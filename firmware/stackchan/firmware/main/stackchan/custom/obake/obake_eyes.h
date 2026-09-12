/*
 * PaHub CH0/CH1 両目 OLED（.ino 移植）。
 */
#pragma once

#include <stdint.h>

namespace stackchan::obake {

bool EyesInit();
void EyesDeinit();
bool EyesLeftOk();
bool EyesRightOk();

/** まばたき・きょろきょろ。描画が必要なときだけバス Lock */
void EyesTick(uint32_t now_ms);

/** 口の ∪/∩ と同期（true=∪笑い）。UI スレッドから読んでよい */
bool EyesMouthSmile();

}  // namespace stackchan::obake
