/*
 * SPDX-FileCopyrightText: 2026 M5Stack Technology CO LTD
 *
 * SPDX-License-Identifier: MIT
 */
#pragma once
#include "home_indicator/home_indicator.h"
#include "loading_page/loading_page.h"
#include "status_bar/status_bar.h"
#include "reminder/reminder.h"
#include "toast/toast.h"
#include <string_view>

namespace common {

#include <stackchan/custom/custom_version.h>
inline constexpr std::string_view FirmwareVersion = stackchan::custom::kFullVersionLabel;

}
