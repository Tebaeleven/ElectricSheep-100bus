/*
 * StackChan IR signal types (compatible with IR_Sensor/my_remotes.h).
 * SPDX-License-Identifier: MIT
 */
#pragma once

#include <cstddef>
#include <cstdint>

namespace stackchan::ir {

/** Matches IRremoteESP8266 decode_type_t values used in generated signal data. */
enum IrProtocol : uint8_t {
    UNKNOWN  = 0,
    NEC      = 4,
    KASEIKYO = 10,  // IRremoteESP8266 decode_type_t; send via Raw until encoder exists
};

enum class IrSignalType : uint8_t {
    Decoded = 0,
    Raw     = 1,
};

struct IrSignal {
    IrSignalType type;
    IrProtocol protocol;
    uint16_t address;
    uint16_t command;
    const uint16_t* rawData;
    size_t rawLen;
};

}  // namespace stackchan::ir
