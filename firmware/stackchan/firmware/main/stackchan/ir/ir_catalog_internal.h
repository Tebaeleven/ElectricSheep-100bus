/*
 * SPDX-License-Identifier: MIT
 */
#pragma once

#include "ir_types.h"

#include <cstddef>

namespace stackchan::ir {

struct IrActionEntry {
    const char* device;
    const char* action;
    const IrSignal* signal;
};

extern const IrActionEntry kIrActionTable[];
extern const size_t kIrActionTableSize;

}  // namespace stackchan::ir
