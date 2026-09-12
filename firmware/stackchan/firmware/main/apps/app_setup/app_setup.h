/*
 * SPDX-FileCopyrightText: 2026 M5Stack Technology CO LTD
 *
 * SPDX-License-Identifier: MIT
 */
#pragma once
#include "setup_menu_sections.h"
#include "view/view.h"
#include <mooncake.h>
#include <cstdint>
#include <memory>

/**
 * @brief 派生 App
 *
 */
class AppSetup : public mooncake::AppAbility {
public:
    AppSetup();

    // 重写生命周期回调
    void onCreate() override;
    void onOpen() override;
    void onRunning() override;
    void onClose() override;

private:
    setup_menu::Runtime _state;
    std::vector<view::SelectMenuPage::MenuSection> _menu_sections;
    std::unique_ptr<view::SelectMenuPage> _menu_page;
};
