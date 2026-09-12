/*
 * SPDX-FileCopyrightText: 2026 M5Stack Technology CO LTD
 *
 * SPDX-License-Identifier: MIT
 */
#pragma once
#include "view/view.h"
#include "workers/workers.h"
#include <memory>
#include <vector>

namespace setup_menu {

struct Runtime {
    bool destroy_menu    = false;
    bool need_warm_reset = false;
    int magic_count      = 0;
    std::unique_ptr<setup_workers::WorkerBase> worker;
};

std::vector<view::SelectMenuPage::MenuSection> build_sections(Runtime& rt);

}  // namespace setup_menu
