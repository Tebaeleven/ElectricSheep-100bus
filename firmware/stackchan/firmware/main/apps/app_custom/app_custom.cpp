/*
 * Custom launcher app: current Agent + addons behavior, gated off official Agent.
 * SPDX-License-Identifier: MIT
 */
#include "app_custom.h"
#include <hal/hal.h>
#include <mooncake.h>
#include <mooncake_log.h>
#include <assets/assets.h>
#include <smooth_lvgl.hpp>
#include <stackchan/custom/custom_integration.h>

using namespace mooncake;
using namespace smooth_ui_toolkit::lvgl_cpp;

AppCustom::AppCustom()
{
    setAppInfo().name = "CUSTOM";
    static auto icon  = assets::get_image("icon_custom.bin");
    setAppInfo().icon = (void*)&icon;
    static uint32_t theme_color = 0x6688FF;
    setAppInfo().userData       = (void*)&theme_color;
}

void AppCustom::onCreate()
{
    mclog::tagInfo(getAppInfo().name, "on create");
}

void AppCustom::onOpen()
{
    mclog::tagInfo(getAppInfo().name, "on open");
    stackchan::custom::EnterCustomSession();
    GetHAL().requestXiaozhiStart();
}

void AppCustom::onRunning() {}

void AppCustom::onClose()
{
    mclog::tagInfo(getAppInfo().name, "on close");
    // CUSTOM を離れたら HW を止め、次回 onOpen で再起動できるようにする
    stackchan::custom::LeaveCustomSession();
}
