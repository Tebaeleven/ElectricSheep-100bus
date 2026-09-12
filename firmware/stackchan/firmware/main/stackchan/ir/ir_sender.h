/*
 * SPDX-License-Identifier: MIT
 */
#pragma once

#include "ir_types.h"

namespace stackchan::ir {

/** StackChan body: IR_SEND = GPIO5, IR_REC = GPIO10 */
constexpr int kIrSendGpio = 5;
constexpr int kIrRecvGpio = 10;

void InitSender();
bool SendSignal(const IrSignal& signal);

}  // namespace stackchan::ir
