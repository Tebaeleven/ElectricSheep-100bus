/*
 * StackChan — Setup menu overlay while Xiaozhi agent is running.
 * SPDX-License-Identifier: MIT
 */
#include "addon_setup_overlay.h"

#include <apps/app_setup/setup_menu_sections.h>
#include <apps/app_setup/view/view.h>
#include <apps/common/common.h>
#include <hal/hal.h>
#include <mooncake_log.h>
#include <stackchan/stackchan.h>

#include <memory>
#include <vector>

static const std::string_view _tag = "AddonSetup";

namespace stackchan::addons {

namespace {

constexpr int kWarmRebootAiAgentIndex = 1;

class SetupOverlay {
public:
    void open()
    {
        if (_active) {
            return;
        }

        LvglLockGuard lock;

        _state = setup_menu::Runtime{};
        _menu_sections = setup_menu::build_sections(_state);
        _menu_page     = std::make_unique<view::SelectMenuPage>(_menu_sections);

        view::destroy_home_indicator();
        view::destroy_status_bar();
        view::create_home_indicator([]() { GetHAL().requestWarmReboot(0); });
        view::create_status_bar();

        _active = true;
        mclog::tagInfo(_tag, "setup overlay opened");
    }

    void update()
    {
        if (!_active) {
            return;
        }

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

    void close()
    {
        if (!_active) {
            return;
        }

        const bool need_warm_reset = _state.need_warm_reset;

        LvglLockGuard lock;

        _menu_sections.clear();
        _menu_page.reset();
        _state.worker.reset();
        _state = setup_menu::Runtime{};

        view::destroy_home_indicator();
        view::destroy_status_bar();
        view::create_home_indicator([]() { GetHAL().requestWarmReboot(0); });
        view::create_status_bar();

        _active = false;
        mclog::tagInfo(_tag, "setup overlay closed");

        if (need_warm_reset) {
            GetHAL().requestWarmReboot(kWarmRebootAiAgentIndex);
            mclog::tagInfo(_tag, "warm reboot to AI agent after setup change");
        }
    }

    bool isActive() const
    {
        return _active;
    }

private:
    bool _active = false;
    setup_menu::Runtime _state;
    std::vector<view::SelectMenuPage::MenuSection> _menu_sections;
    std::unique_ptr<view::SelectMenuPage> _menu_page;
};

static SetupOverlay _overlay;

}  // namespace

void open_addon_setup_overlay()
{
    _overlay.open();
}

void update_addon_setup_overlay()
{
    _overlay.update();
}

void close_addon_setup_overlay()
{
    _overlay.close();
}

bool is_addon_setup_overlay_active()
{
    return _overlay.isActive();
}

}  // namespace stackchan::addons
