/*

 * SPDX-License-Identifier: MIT

 */

#include "addon_screensaver.h"



#include <games/dvd_screensaver/dvd_screensaver.hpp>

#include <hal/hal.h>

#include <smooth_lvgl.hpp>



#include <cstdint>

#include <memory>



using namespace uitk;

using namespace uitk::lvgl_cpp;

using namespace uitk::games;

using namespace uitk::games::dvd_screensaver;



namespace stackchan::addons {



namespace {



constexpr uint32_t kScreensaverTimeoutMs = 60000;

constexpr uint32_t kScreensaverUpdateMs  = 30;



static const Vector2 kScreenSize = {320, 240};

static const Vector2 kLogoSize   = {64, 48};

static const int kLogoId         = 667;

static const std::vector<uint32_t> kLogoColors = {

    0xffffff, 0xfffa01, 0xff8300, 0x00feff, 0xff2600, 0xbe00ff, 0x0026ff, 0xff008b,

};

static const uint32_t kBgColor = 0x000000;



class AddonScreensaver : public DvdScreensaver {

public:

    ~AddonScreensaver() override

    {

        if (_prev_screen) {

            _prev_screen->load();

        }

    }



    void onInit() override

    {

        _prev_screen = std::make_unique<ScreenActive>();



        _screen = std::make_unique<Screen>();

        _screen->setBgColor(lv_color_hex(kBgColor));

        _screen->removeFlag(LV_OBJ_FLAG_SCROLLABLE);

        _screen->setPadding(0, 0, 0, 0);

        _screen->addFlag(LV_OBJ_FLAG_CLICKABLE);

        _screen->onClick().connect([this]() { _dismiss_requested = true; });

        _screen->load();



        _logo = std::make_unique<Container>(_screen->get());

        _logo->setSize(kLogoSize.width, kLogoSize.height);

        _logo->setBgColor(lv_color_hex(kLogoColors[0]));

        _logo->align(LV_ALIGN_TOP_LEFT, 2333, 2333);

        _logo->removeFlag(LV_OBJ_FLAG_SCROLLABLE);

        _logo->setPadding(0, 0, 0, 0);

        _logo->setBorderWidth(0);

        _logo->setRadius(0);



        _left_eye = std::make_unique<Container>(_logo->get());

        _left_eye->align(LV_ALIGN_CENTER, -15, -3);

        _left_eye->setBgColor(lv_color_hex(kBgColor));

        _left_eye->removeFlag(LV_OBJ_FLAG_SCROLLABLE);

        _left_eye->setRadius(LV_RADIUS_CIRCLE);

        _left_eye->setBorderWidth(0);

        _left_eye->setSize(6, 6);



        _right_eye = std::make_unique<Container>(_logo->get());

        _right_eye->align(LV_ALIGN_CENTER, 15, -3);

        _right_eye->setBgColor(lv_color_hex(kBgColor));

        _right_eye->removeFlag(LV_OBJ_FLAG_SCROLLABLE);

        _right_eye->setRadius(LV_RADIUS_CIRCLE);

        _right_eye->setBorderWidth(0);

        _right_eye->setSize(6, 6);



        _mouth = std::make_unique<Container>(_logo->get());

        _mouth->align(LV_ALIGN_CENTER, 0, 5);

        _mouth->setBgColor(lv_color_hex(kBgColor));

        _mouth->removeFlag(LV_OBJ_FLAG_SCROLLABLE);

        _mouth->setBorderWidth(0);

        _mouth->setSize(18, 2);

        _mouth->setRadius(0);

    }



    void onBuildLevel() override

    {

        addScreenFrameAsWall(kScreenSize);



        auto& random      = Random::getInstance();

        Vector2 direction = {random.getFloat(0.3f, 0.7f), random.getFloat(0.3f, 0.7f)};

        direction         = direction.normalized();



        addLogo(kLogoId, {kScreenSize.width / 2, kScreenSize.height / 2}, kLogoSize, direction, 110);

    }



    void onRender(float dt) override

    {

        (void)dt;

        getWorld().forEachObject([&](GameObject* obj) {

            if (obj->groupId == kLogoId) {

                auto p = obj->get<Transform>()->position;

                _logo->setPos(static_cast<int>(p.x) - kLogoSize.width / 2,

                              static_cast<int>(p.y) - kLogoSize.height / 2);

            }

        });

    }



    void onLogoCollide(int logoGroupId) override

    {

        (void)logoGroupId;

        _color_index++;

        if (_color_index >= static_cast<int>(kLogoColors.size())) {

            _color_index = 0;

        }

        _logo->setBgColor(lv_color_hex(kLogoColors[_color_index]));

    }



    bool dismissRequested() const

    {

        return _dismiss_requested;

    }



private:

    std::unique_ptr<ScreenActive> _prev_screen;

    std::unique_ptr<Screen> _screen;

    std::unique_ptr<Container> _logo;

    std::unique_ptr<Container> _left_eye;

    std::unique_ptr<Container> _right_eye;

    std::unique_ptr<Container> _mouth;

    int _color_index        = 0;

    bool _dismiss_requested = false;

};



std::unique_ptr<AddonScreensaver> g_screensaver;

uint32_t g_screensaver_last_update_ms = 0;



void dismiss_screensaver()

{
    if (!g_screensaver) {
        return;
    }
    g_screensaver.reset();
    notify_addon_panel_activity();

}



}  // namespace



void notify_addon_panel_activity()

{

    lv_disp_trig_activity(nullptr);

}



void update_addon_screensaver(bool panel_open)

{

    if (!panel_open) {

        dismiss_screensaver();

        return;

    }



    if (g_screensaver) {

        if (g_screensaver->dismissRequested()) {

            dismiss_screensaver();

            return;

        }



        const uint32_t now = GetHAL().millis();

        if (now - g_screensaver_last_update_ms >= kScreensaverUpdateMs) {

            g_screensaver_last_update_ms = now;

            g_screensaver->update();

        }

        return;

    }



    const uint32_t idle_ms = lv_display_get_inactive_time(nullptr);

    if (idle_ms >= kScreensaverTimeoutMs) {

        g_screensaver = std::make_unique<AddonScreensaver>();

        g_screensaver->init();

        g_screensaver_last_update_ms = GetHAL().millis();

    }

}



bool is_addon_screensaver_active()

{

    return static_cast<bool>(g_screensaver);

}



}  // namespace stackchan::addons

