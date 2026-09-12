/*
 * PaHub CH2 ToF（VL53L0X Long Range、上限 200 cm）。
 */
#pragma once

#include <stdint.h>

namespace stackchan::obake {

bool TofInit();
void TofDeinit();
bool TofOk();

/** 1 Hz 想定。有効距離 cm。無効時は -1 */
int TofLastCm();

/** バス Lock 内で測距更新 */
void TofTick(uint32_t now_ms);

}  // namespace stackchan::obake
