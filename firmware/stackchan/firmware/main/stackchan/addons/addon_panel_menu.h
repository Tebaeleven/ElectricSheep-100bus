/*
 * StackChan custom: main Addons menu action ids (add new ids here).
 * Labels live in addon_strings_ja.h; bindings in addon_panel.cpp (kMainMenuBindings).
 * SPDX-License-Identifier: MIT
 */
#pragma once

#include <cstdint>

namespace stackchan::addons {

/** Identifies a top-level Addons menu button (mapped in addon_panel.cpp). */
enum class AddonMenuAction : uint8_t {
    IrDevices,
    AiBackend,
    Servo,
    FaceFollow,
    MusicDance,
    EspNowRemote,
    OpenSettings,
    FirmwareUpdate,
};

}  // namespace stackchan::addons
