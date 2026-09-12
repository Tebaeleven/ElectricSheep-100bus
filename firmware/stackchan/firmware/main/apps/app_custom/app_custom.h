/*
 * SPDX-License-Identifier: MIT
 */
#pragma once
#include <mooncake.h>

class AppCustom : public mooncake::AppAbility {
public:
    AppCustom();

    void onCreate() override;
    void onOpen() override;
    void onRunning() override;
    void onClose() override;
};
