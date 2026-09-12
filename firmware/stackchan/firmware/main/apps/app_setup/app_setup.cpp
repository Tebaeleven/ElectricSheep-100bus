/*
 * SPDX-FileCopyrightText: 2026 M5Stack Technology CO LTD
 *
 * SPDX-License-Identifier: MIT
 */
#include "app_setup.h"
#include <hal/hal.h>
#include <mooncake.h>
#include <mooncake_log.h>
#include <assets/assets.h>
#include <stackchan/stackchan.h>
#include <apps/common/common.h>

using namespace mooncake;
using namespace view;

AppSetup::AppSetup()
{
    // 配置 App 名
    setAppInfo().name = "SETUP";
    // 配置 App 图标
    static auto icon  = assets::get_image("icon_setup.bin");
    setAppInfo().icon = (void*)&icon;
    // 配置 App 主题颜色
    static uint32_t theme_color = 0xB3B3B3;
    setAppInfo().userData       = (void*)&theme_color;
}

void AppSetup::onCreate()
{
    mclog::tagInfo(getAppInfo().name, "on create");
    // open();
}

void AppSetup::onOpen()
{
    mclog::tagInfo(getAppInfo().name, "on open");

    _state = setup_menu::Runtime{};

    _menu_sections = setup_menu::build_sections(_state);

    LvglLockGuard lock;

    _menu_page = std::make_unique<view::SelectMenuPage>(_menu_sections);

    view::create_home_indicator([&]() { close(); });
    view::create_status_bar();
}

void AppSetup::onRunning()
{
    LvglLockGuard lock;

    if (_menu_page) {
        _menu_page->update();
    }

    if (_state.destroy_menu) {
        _menu_page.reset();
        _state.destroy_menu = false;
    }

    if (_state.worker) {
        _state.worker->update();
        if (_state.worker->isDone()) {
            _state.worker.reset();
            _menu_page = std::make_unique<view::SelectMenuPage>(_menu_sections);
        }
    }

    GetStackChan().update();

    view::update_home_indicator();
    view::update_status_bar();
}

void AppSetup::onClose()
{
    mclog::tagInfo(getAppInfo().name, "on close");

    LvglLockGuard lock;

    _menu_sections.clear();
    _menu_page.reset();
    _state.worker.reset();

    view::destroy_home_indicator();
    view::destroy_status_bar();

    if (_state.need_warm_reset) {
        GetHAL().requestWarmReboot(6);
    }
}
