/*
 * SPDX-FileCopyrightText: 2026 M5Stack Technology CO LTD
 *
 * SPDX-License-Identifier: MIT
 */
#include "setup_menu_sections.h"

#include <apps/common/common.h>
#include <fmt/format.h>

namespace setup_menu {

std::vector<view::SelectMenuPage::MenuSection> build_sections(Runtime& rt)
{
    using namespace setup_workers;

    return {
        {
            "Wi-Fi",
            {{"Change Wi-Fi",
              [&]() {
                  rt.destroy_menu    = true;
                  rt.need_warm_reset = true;
                  rt.worker          = std::make_unique<WifiSetupWorker>();
              }}},
        },
        {
            "Device",
            {{"Brightness",
              [&]() {
                  rt.destroy_menu = true;
                  rt.worker       = std::make_unique<BrightnessSetupWorker>();
              }},
             {"Volume",
              [&]() {
                  rt.destroy_menu = true;
                  rt.worker       = std::make_unique<VolumeSetupWorker>();
              }},
             {"Timezone",
              [&]() {
                  rt.destroy_menu = true;
                  rt.worker       = std::make_unique<TimezoneWorker>();
              }}},
        },
        {
            "AI.Agent",
            {{"General",
              [&]() {
                  rt.destroy_menu    = true;
                  rt.need_warm_reset = true;
                  rt.worker          = std::make_unique<XiaozhiGeneralWorker>();
              }},
             {"Power Saving",
              [&]() {
                  rt.destroy_menu    = true;
                  rt.need_warm_reset = true;
                  rt.worker          = std::make_unique<XiaozhiPowerSavingWorker>();
              }}},
        },
        {
            "Hardware Test",
            {{"Servo",
              [&]() {
                  rt.destroy_menu = true;
                  rt.worker       = std::make_unique<ZeroCalibrationWorker>();
              }},
             {"Microphone",
              [&]() {
                  rt.destroy_menu = true;
                  rt.worker       = std::make_unique<MicTestWorker>();
              }},
             {"RGB Strip",
              [&]() {
                  rt.destroy_menu = true;
                  rt.worker       = std::make_unique<RgbTestWorker>();
              }}},
        },
        {
            "Account",
            {{"Unbind & Reset",
              [&]() {
                  rt.destroy_menu    = true;
                  rt.need_warm_reset = true;
                  rt.worker          = std::make_unique<AccountWorker>();
              }}},
        },
        {
            "Firmware",
            {
                {fmt::format("Version:  {}", common::FirmwareVersion),
                 [&]() {
                     rt.magic_count++;
                     if (rt.magic_count >= 10) {
                         rt.magic_count  = 0;
                         rt.destroy_menu = true;
                         rt.worker       = std::make_unique<FwVersionWorker>();
                     }
                 }},
                {"Check for Updates",
                 [&]() {
                     rt.destroy_menu    = true;
                     rt.need_warm_reset = true;
                     rt.worker          = std::make_unique<SystemUpdateWorker>();
                 }},
            },
        },
    };
}

}  // namespace setup_menu
