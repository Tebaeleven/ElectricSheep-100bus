/*
 * StackChan custom addon panel — opened by swipe from the right screen edge.
 * UI layout mirrors app_setup SelectMenuPage; only custom features are added here.
 * SPDX-License-Identifier: MIT
 */
#include "addon_panel.h"

#include "addon_panel_menu.h"
#include "addon_strings_ja.h"
#include "addon_screensaver.h"
#include "addon_setup_overlay.h"
#include "addon_servo_guard.h"
#include "addon_ui_common.h"

#include <stackchan/features/espnow_remote.h>
#include <stackchan/features/feature_settings.h>

#include <apps/common/toast/toast.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <smooth_ui_toolkit.hpp>
#include <hal/hal.h>
#include <mooncake_log.h>
#include <stackchan/agent_profile/agent_profile.h>
#include <stackchan/avatar/skins/default/default.h>
#include <stackchan/ir/ir_catalog.h>
#include <stackchan/ir/ir_on_off.h>
#include <stackchan/custom/custom_ota.h>
#include <stackchan/stackchan.h>

#include <fmt/format.h>

#include <lvgl.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <functional>
#include <memory>
#include <string>
#include <vector>

using namespace smooth_ui_toolkit::lvgl_cpp;
using namespace stackchan::agent_profile;
using namespace stackchan::ir;
using namespace stackchan::addons::strings;
using namespace stackchan::addons::ui;
using namespace stackchan::features;

static const std::string_view _tag = "AddonPanel";

namespace stackchan::addons {

namespace {

constexpr int kEdgeSwipeW = 40;
constexpr uint32_t kTapSuppressAfterGestureMs = 400;
constexpr uint32_t kEdgeGestureTimeoutMs = 1200;

std::atomic<bool> g_apply_task_running{false};
std::atomic<bool> g_fw_ota_task_running{false};

static void firmware_ota_task(void*)
{
    stackchan::custom::CheckAndInstallFirmware([](std::string_view msg) {
        mclog::tagInfo(_tag, "{}", msg);
    });
    g_fw_ota_task_running.store(false);
    vTaskDelete(nullptr);
}
enum class ApplyBackendResult : uint8_t { None = 0, Success, Failed };
std::atomic<ApplyBackendResult> g_apply_backend_result{ApplyBackendResult::None};
bool g_edge_gesture_tracking = false;
uint32_t g_edge_gesture_tracking_started_ms = 0;
uint32_t g_tap_suppress_until_ms = 0;

void set_tap_suppress_cooldown(uint32_t ms = kTapSuppressAfterGestureMs)
{
    if (ms == 0) {
        g_tap_suppress_until_ms = 0;
        return;
    }
    g_tap_suppress_until_ms = GetHAL().millis() + ms;
}

void sync_agent_screen_tap_target(bool enabled)
{
    auto& stackchan = GetStackChan();
    if (!stackchan.hasAvatar()) {
        return;
    }

    auto* avatar = dynamic_cast<avatar::DefaultAvatar*>(&stackchan.avatar());
    if (!avatar) {
        return;
    }

    auto* panel = avatar->getPanel();
    if (!panel) {
        return;
    }

    if (enabled) {
        panel->addFlag(LV_OBJ_FLAG_CLICKABLE);
    } else {
        panel->removeFlag(LV_OBJ_FLAG_CLICKABLE);
    }
}

void sync_addon_panel_layer_order(lv_obj_t* backdrop_obj, bool panel_open)
{
    if (!backdrop_obj) {
        return;
    }

    auto& stackchan = GetStackChan();
    if (!stackchan.hasAvatar()) {
        if (panel_open) {
            lv_obj_move_foreground(backdrop_obj);
        }
        return;
    }

    auto* avatar = dynamic_cast<avatar::DefaultAvatar*>(&stackchan.avatar());
    if (!avatar) {
        if (panel_open) {
            lv_obj_move_foreground(backdrop_obj);
        }
        return;
    }

    auto* panel = avatar->getPanel();
    if (!panel) {
        if (panel_open) {
            lv_obj_move_foreground(backdrop_obj);
        }
        return;
    }

    if (panel_open) {
        lv_obj_move_foreground(backdrop_obj);
        lv_obj_move_background(panel->get());
    }
}

enum class Page { Menu, IrDeviceSelect, IrControl, AiBackend, Servo, FaceFollowMode, MusicDanceMode, EspNowRemote };

enum class FeatureSettingKind { FaceFollow, MusicDance };

enum class PendingAction {
    None,
    ShowMenu,
    ShowIr,
    ShowIrControl,
    ShowBackend,
    ShowServo,
    ShowFaceFollow,
    ShowMusicDance,
    ShowEspNowRemote,
    Hide,
    Back,
    SendIrOn,
    SendIrOff,
    ApplyBackend,
    ServoHoldOn,
    ServoHoldOff,
    ServoGoHome,
    EspNowRemoteOn,
    EspNowRemoteOff,
    OpenSettings,
    FirmwareUpdate,
};

constexpr const char* kIrPanelDeviceOrder[] = {"light", "tv", "aircon", "speaker", "unknown"};

struct MainMenuBinding {
    const char* label;
    AddonMenuAction action;
};

/** Add a row here to expose a new top-level Addons menu button. */
static constexpr MainMenuBinding kMainMenuBindings[] = {
    {kMenuIr, AddonMenuAction::IrDevices},
    {kMenuAi, AddonMenuAction::AiBackend},
    {kMenuServo, AddonMenuAction::Servo},
    {kMenuFaceFollow, AddonMenuAction::FaceFollow},
    {kMenuMusicDance, AddonMenuAction::MusicDance},
    {kMenuEspNowRemote, AddonMenuAction::EspNowRemote},
    {kMenuSettings, AddonMenuAction::OpenSettings},
    {kMenuFirmwareUpdate, AddonMenuAction::FirmwareUpdate},
};

/** Top-to-bottom order on mode pages: Home Server, On Device, OFF. */
static constexpr FeatureRunMode kFeatureModeUiOrder[] = {
    FeatureRunMode::Homelab,
    FeatureRunMode::Device,
    FeatureRunMode::Off,
};

static constexpr const char* kFeatureModeUiLabels[] = {
    kBtnModeHomelab,
    kBtnModeDevice,
    kBtnModeOff,
};

static constexpr std::array<const char*, 5> kIdleMotionFreqLabels = {"0.25x", "0.5x", "0.75x", "1.0x", "2.0x"};

PendingAction menu_action_to_pending(AddonMenuAction action)
{
    switch (action) {
    case AddonMenuAction::IrDevices:
        return PendingAction::ShowIr;
    case AddonMenuAction::AiBackend:
        return PendingAction::ShowBackend;
    case AddonMenuAction::Servo:
        return PendingAction::ShowServo;
    case AddonMenuAction::FaceFollow:
        return PendingAction::ShowFaceFollow;
    case AddonMenuAction::MusicDance:
        return PendingAction::ShowMusicDance;
    case AddonMenuAction::EspNowRemote:
        return PendingAction::ShowEspNowRemote;
    case AddonMenuAction::OpenSettings:
        return PendingAction::OpenSettings;
    case AddonMenuAction::FirmwareUpdate:
        return PendingAction::FirmwareUpdate;
    }
    return PendingAction::None;
}

const char* device_label_en(std::string_view device_id)
{
    if (device_id == "light") {
        return "Light";
    }
    if (device_id == "tv") {
        return "TV";
    }
    if (device_id == "aircon") {
        return "AC";
    }
    if (device_id == "speaker") {
        return "Radio";
    }
    if (device_id == "unknown") {
        return "Fan";
    }
    return "Unknown";
}

std::vector<std::string> ordered_panel_devices()
{
    const auto available = ListDevices();
    std::vector<std::string> out;
    for (const char* id : kIrPanelDeviceOrder) {
        if (std::find(available.begin(), available.end(), id) != available.end()) {
            out.emplace_back(id);
        }
    }
    return out;
}

static void apply_backend_task(void* param)
{
    const ProfileId profile = *static_cast<ProfileId*>(param);
    delete static_cast<ProfileId*>(param);

    const bool ok = ApplyProfile(profile, true);
    g_apply_task_running.store(false);

    g_apply_backend_result.store(ok ? ApplyBackendResult::Success : ApplyBackendResult::Failed);

    vTaskDelete(nullptr);
}

class RightEdgeSwipeGesture {
public:
    std::function<void()> onSwipeOpen;

    void init()
    {
        _screen_width   = kScreenW;
        _edge_threshold = kEdgeSwipeW;
        _swipe_min_dist = 45;
    }

    void update(bool panel_open)
    {
        if (panel_open) {
            return;
        }

        lv_indev_t* indev = GetHAL().lvTouchpad;
        if (!indev) {
            return;
        }

        lv_indev_state_t state = lv_indev_get_state(indev);
        lv_point_t curr;
        lv_indev_get_point(indev, &curr);

        if (state == LV_INDEV_STATE_PR && _last_state == LV_INDEV_STATE_REL) {
            if (curr.x >= _screen_width - _edge_threshold) {
                _start    = curr;
                _tracking = true;
                g_edge_gesture_tracking = true;
                g_edge_gesture_tracking_started_ms = GetHAL().millis();
                sync_agent_screen_tap_target(false);
            } else {
                _tracking = false;
            }
        } else if (state == LV_INDEV_STATE_REL && _last_state == LV_INDEV_STATE_PR) {
            if (_tracking) {
                const int delta_x = _start.x - curr.x;
                const int delta_y = abs(curr.y - _start.y);
                if (delta_x > _swipe_min_dist && delta_x > delta_y) {
                    set_tap_suppress_cooldown();
                    if (onSwipeOpen) {
                        onSwipeOpen();
                    }
                } else {
                    set_tap_suppress_cooldown();
                    sync_agent_screen_tap_target(true);
                }
                _tracking               = false;
                g_edge_gesture_tracking = false;
                g_edge_gesture_tracking_started_ms = 0;
            }
        }
        _last_state = state;
    }

private:
    bool _tracking               = false;
    lv_indev_state_t _last_state = LV_INDEV_STATE_REL;
    lv_point_t _start{};
    int _screen_width            = kScreenW;
    int _edge_threshold          = kEdgeSwipeW;
    int _swipe_min_dist          = 45;
};

class AddonPanel {
public:
    void init(lv_obj_t* parent)
    {
        _parent = parent ? parent : lv_screen_active();

        _gesture              = std::make_unique<RightEdgeSwipeGesture>();
        _gesture->onSwipeOpen = [this]() {
            if (_action_busy) {
                return;
            }
            NotifyPanelOpening();
            queue_action(PendingAction::ShowMenu);
            open_shell();
        };
        _gesture->init();

        build_shell();
        hide();
    }

    void update_gesture()
    {
        _gesture->update(is_open());
    }

    void update_actions()
    {
        const bool open_now = is_open();
        process_pending_action();
        process_apply_backend_result();
        if (open_now) {
            if (_need_chrome_sync) {
                sync_addon_panel_layer_order(_backdrop->get(), true);
                raise_header_layer();
                _need_chrome_sync = false;
            }
            update_addon_screensaver(true);
        } else if (_was_open_last_frame) {
            update_addon_screensaver(false);
        }
        _was_open_last_frame = open_now;
        poll_idle_motion_freq();
    }

    void poll_idle_motion_freq()
    {
        if (_page != Page::Servo || _idle_freq_pending < 0 || !_label_idle_motion_value) {
            return;
        }

        if (_idle_freq_pending != _idle_freq_applied) {
            SetIdleMotionFreqPreset(_idle_freq_pending);
            update_idle_motion_label(static_cast<uint8_t>(_idle_freq_pending));
            _idle_freq_applied = _idle_freq_pending;
        }
    }

    void commit_idle_motion_freq_nvs()
    {
        if (_idle_freq_pending >= 0) {
            SetIdleMotionFreqPreset(_idle_freq_pending);
            _idle_freq_applied = _idle_freq_pending;
            ScheduleIdleMotionFreqSave(0);
        }
    }

    void mark_chrome_dirty()
    {
        _need_chrome_sync = true;
    }

    bool isOpen() const
    {
        return is_open();
    }

private:
    lv_obj_t* _parent = nullptr;
    std::unique_ptr<RightEdgeSwipeGesture> _gesture;

    std::unique_ptr<Container> _backdrop;
    std::unique_ptr<Container> _drawer;
    std::unique_ptr<Label> _title;
    std::unique_ptr<Label> _version_label;
    std::unique_ptr<Container> _scroll;

    Page _page = Page::Menu;
    PendingAction _pending_action = PendingAction::None;
    bool _action_busy             = false;
    int _selected_ir_device_index = 0;

    std::vector<std::string> _ir_devices;
    std::vector<std::string> _ir_device_labels;
    std::string _version_text;

    ProfileId _pending_profile = ProfileId::Cloud;

    std::unique_ptr<Roller> _backend_roller;
    std::unique_ptr<Label> _backend_url_label;
    std::string _backend_opts;
    std::string _backend_url_text;

    std::unique_ptr<Button> _btn_header_back;
    std::unique_ptr<Button> _page_action_btn;
    std::unique_ptr<Button> _btn_ir_on;
    std::unique_ptr<Button> _btn_ir_off;
    std::unique_ptr<Button> _btn_servo_hold_on;
    std::unique_ptr<Button> _btn_servo_hold_off;
    std::unique_ptr<Button> _btn_servo_home;
    std::unique_ptr<Button> _btn_espnow_on;
    std::unique_ptr<Button> _btn_espnow_off;
    std::unique_ptr<Label> _label_idle_motion_title;
    std::unique_ptr<Label> _label_idle_motion_value;
    std::unique_ptr<Slider> _slider_idle_motion;
    std::vector<std::unique_ptr<Button>> _feature_mode_buttons;

    std::vector<std::unique_ptr<Button>> _menu_buttons;
    std::vector<std::unique_ptr<Container>> _scroll_spacers;
    bool _need_chrome_sync = true;
    bool _was_open_last_frame = false;
    int _idle_freq_pending = -1;
    int _idle_freq_applied = -1;
    std::array<int, static_cast<size_t>(Page::EspNowRemote) + 1> _page_scroll_y{};

    FeatureSettingKind _feature_setting_kind = FeatureSettingKind::FaceFollow;

    bool is_open() const
    {
        return _backdrop && !_backdrop->hasFlag(LV_OBJ_FLAG_HIDDEN);
    }

    size_t page_index(Page page) const
    {
        return static_cast<size_t>(page);
    }

    void reset_page_scroll_positions()
    {
        _page_scroll_y.fill(0);
    }

    void save_current_page_scroll()
    {
        if (!_scroll || !_scroll->get()) {
            return;
        }
        _page_scroll_y[page_index(_page)] = lv_obj_get_scroll_y(_scroll->get());
    }

    void restore_page_scroll(Page page)
    {
        if (!_scroll || !_scroll->get()) {
            return;
        }
        const int scroll_y = _page_scroll_y[page_index(page)];
        lv_obj_scroll_to_y(_scroll->get(), scroll_y, LV_ANIM_OFF);
    }

    void queue_action(PendingAction action)
    {
        if (_action_busy && action != PendingAction::Hide) {
            return;
        }
        notify_addon_panel_activity();
        _pending_action = action;
    }

    void process_pending_action()
    {
        if (_pending_action == PendingAction::None) {
            return;
        }

        const PendingAction action = _pending_action;
        _pending_action            = PendingAction::None;
        _action_busy               = true;

        switch (action) {
        case PendingAction::ShowMenu:
            save_current_page_scroll();
            show_menu();
            break;
        case PendingAction::ShowIr:
            save_current_page_scroll();
            show_ir_device_select();
            break;
        case PendingAction::ShowIrControl:
            save_current_page_scroll();
            show_ir_control();
            break;
        case PendingAction::ShowBackend:
            save_current_page_scroll();
            show_backend();
            break;
        case PendingAction::ShowServo:
            save_current_page_scroll();
            show_servo();
            break;
        case PendingAction::ShowFaceFollow:
            save_current_page_scroll();
            show_feature_mode_page(FeatureSettingKind::FaceFollow);
            break;
        case PendingAction::ShowMusicDance:
            save_current_page_scroll();
            show_feature_mode_page(FeatureSettingKind::MusicDance);
            break;
        case PendingAction::ShowEspNowRemote:
            save_current_page_scroll();
            show_espnow_remote();
            break;
        case PendingAction::Hide:
            save_current_page_scroll();
            hide();
            break;
        case PendingAction::Back:
            save_current_page_scroll();
            if (_page == Page::Menu) {
                hide();
            } else if (_page == Page::IrControl) {
                show_ir_device_select();
            } else {
                show_menu();
            }
            break;
        case PendingAction::SendIrOn:
            send_ir(true);
            break;
        case PendingAction::SendIrOff:
            send_ir(false);
            break;
        case PendingAction::ApplyBackend:
            apply_backend();
            break;
        case PendingAction::ServoHoldOn:
            set_servo_hold(true);
            break;
        case PendingAction::ServoHoldOff:
            set_servo_hold(false);
            break;
        case PendingAction::ServoGoHome:
            GoServoHome();
            SyncServoPolicy(true);
            break;
        case PendingAction::EspNowRemoteOn:
            set_espnow_remote_enabled(true);
            break;
        case PendingAction::EspNowRemoteOff:
            set_espnow_remote_enabled(false);
            break;
        case PendingAction::OpenSettings:
            open_system_settings();
            break;
        case PendingAction::FirmwareUpdate:
            start_firmware_update();
            break;
        default:
            break;
        }

        _action_busy = false;
    }

    void build_shell()
    {
        _backdrop = std::make_unique<Container>(_parent);
        _backdrop->setSize(kScreenW, kScreenH);
        _backdrop->align(LV_ALIGN_CENTER, 0, 0);
        _backdrop->setBgColor(lv_color_hex(0x000000));
        _backdrop->setBgOpa(0);
        _backdrop->setBorderWidth(0);
        _backdrop->addFlag(LV_OBJ_FLAG_FLOATING);
        _backdrop->addFlag(LV_OBJ_FLAG_CLICKABLE);
        _backdrop->removeFlag(LV_OBJ_FLAG_SCROLLABLE);
        _backdrop->onClick().connect([this]() {
            if (is_addon_screensaver_active()) {
                notify_addon_panel_activity();
                return;
            }
            queue_action(PendingAction::Hide);
        });
        _backdrop->addFlag(LV_OBJ_FLAG_HIDDEN);

        _drawer = std::make_unique<Container>(_backdrop->get());
        _drawer->setSize(kScreenW, kScreenH);
        _drawer->align(LV_ALIGN_CENTER, 0, 0);
        _drawer->setBgColor(lv_color_hex(kColorBgPanel));
        _drawer->setBorderWidth(0);
        _drawer->setRadius(0);
        _drawer->removeFlag(LV_OBJ_FLAG_SCROLLABLE);
        _drawer->addFlag(LV_OBJ_FLAG_CLICKABLE);

        _title = std::make_unique<Label>(_drawer->get());
        _title->setText(kTitleAddons);
        _title->setTextFont(kUiFont());
        _title->setTextColor(lv_color_hex(kColorTextPrimary));
        setup_header_title_label(*_title);

        _version_label = std::make_unique<Label>(_drawer->get());
        _version_text = fmt::format(" v{}", kAddonVersion);
        _version_label->setText(_version_text.c_str());
        _version_label->setTextFont(kUiFont());
        _version_label->setTextColor(lv_color_hex(kColorTextMuted));
        _version_label->addFlag(LV_OBJ_FLAG_HIDDEN);

        _btn_header_back = std::make_unique<Button>(_drawer->get());
        setup_header_back_button(*_btn_header_back);
        _btn_header_back->label().setText(kBtnBack);
        _btn_header_back->onClick().connect([this]() { queue_action(PendingAction::Back); });

        _scroll = std::make_unique<Container>(_drawer->get());
        setup_scroll_panel(*_scroll);

        layout_header_chrome(false);
        raise_header_layer();
    }

    void layout_header_chrome(bool show_version)
    {
        if (_title) {
            setup_header_title_label(*_title);
        }
        if (_btn_header_back) {
            setup_header_back_button(*_btn_header_back);
        }
        if (_version_label) {
            if (show_version && _title) {
                lv_point_t title_size{};
                lv_txt_get_size(&title_size,
                                _title->getText(),
                                kUiFont(),
                                0,
                                0,
                                kTitleMaxW,
                                LV_TEXT_FLAG_NONE);
                const int version_x = std::min<int>(kSidePad + title_size.x, kHeaderBackX - 48);
                _version_label->align(LV_ALIGN_TOP_LEFT, version_x, kHeaderTextY);
                _version_label->removeFlag(LV_OBJ_FLAG_HIDDEN);
            } else {
                _version_label->addFlag(LV_OBJ_FLAG_HIDDEN);
            }
        }
    }

    void raise_header_layer()
    {
        if (_scroll) {
            lv_obj_move_background(_scroll->get());
        }
        if (_title) {
            lv_obj_move_foreground(_title->get());
        }
        if (_version_label) {
            lv_obj_move_foreground(_version_label->get());
        }
        if (_btn_header_back) {
            lv_obj_move_foreground(_btn_header_back->get());
        }
    }

    void update_header_chrome(const char* title, bool show_version)
    {
        _title->setText(title);
        layout_header_chrome(show_version);
        raise_header_layer();
    }

    void finish_scroll_layout(int content_bottom_y)
    {
        const bool needs_scroll = scroll_content_needs_scroll(content_bottom_y);
        apply_scroll_content_fit(*_scroll, needs_scroll);

        auto pad = std::make_unique<Container>(_scroll->get());
        pad->setSize(kBtnListW, kScrollBottomPad);
        pad->align(LV_ALIGN_TOP_MID, 0, content_bottom_y);
        pad->setBgOpa(0);
        pad->setBorderWidth(0);
        pad->removeFlag(LV_OBJ_FLAG_SCROLLABLE);
        _scroll_spacers.push_back(std::move(pad));
    }

    void open_shell()
    {
        reset_page_scroll_positions();
        _backdrop->removeFlag(LV_OBJ_FLAG_HIDDEN);
        sync_addon_panel_layer_order(_backdrop->get(), true);
        sync_agent_screen_tap_target(false);
        notify_addon_panel_activity();
        show_menu();
        SyncServoPolicy(true);
        mclog::tagInfo(_tag, "panel opened");
    }

    void hide()
    {
        commit_idle_motion_freq_nvs();
        update_addon_screensaver(false);
        if (_backdrop) {
            _backdrop->addFlag(LV_OBJ_FLAG_HIDDEN);
        }
        _page = Page::Menu;
        set_tap_suppress_cooldown();
        sync_agent_screen_tap_target(true);
        SyncServoPolicy(false);
    }

    void clear_content()
    {
        commit_idle_motion_freq_nvs();
        _idle_freq_pending = -1;
        _idle_freq_applied = -1;
        _backend_roller.reset();
        _backend_url_label.reset();
        _page_action_btn.reset();
        _btn_ir_on.reset();
        _btn_ir_off.reset();
        _btn_servo_hold_on.reset();
        _btn_servo_hold_off.reset();
        _btn_servo_home.reset();
        _label_idle_motion_title.reset();
        _label_idle_motion_value.reset();
        _slider_idle_motion.reset();
        _feature_mode_buttons.clear();
        _menu_buttons.clear();
        _scroll_spacers.clear();
        _ir_device_labels.clear();
        _backend_opts.clear();
        _backend_url_text.clear();

        if (_scroll && _scroll->get()) {
            lv_obj_clean(_scroll->get());
            lv_obj_scroll_to_y(_scroll->get(), 0, LV_ANIM_OFF);
            setup_scroll_panel(*_scroll);
        }
        mark_chrome_dirty();
        raise_header_layer();
    }

    void process_apply_backend_result()
    {
        const ApplyBackendResult result = g_apply_backend_result.exchange(ApplyBackendResult::None);
        if (result == ApplyBackendResult::None) {
            return;
        }

        if (result == ApplyBackendResult::Success) {
            view::pop_a_toast("Applied (no reboot)", view::ToastType::Success, 1600);
            return;
        }

        view::pop_a_toast(kToastOtaFailed, view::ToastType::Error, 3000);
    }

    void add_list_button(int y, const char* text, PendingAction action)
    {
        auto btn = std::make_unique<Button>(_scroll->get());
        setup_list_button(*btn, y);
        btn->label().setText(text);
        btn->onClick().connect([this, action]() { queue_action(action); });
        _menu_buttons.push_back(std::move(btn));
    }

    void show_menu()
    {
        _page = Page::Menu;
        update_header_chrome(kTitleAddons, true);
        clear_content();

        int y = 4;
        for (const auto& entry : kMainMenuBindings) {
            add_list_button(y, entry.label, menu_action_to_pending(entry.action));
            y += kBtnListH + kBtnGap;
        }
        finish_scroll_layout(y - kBtnGap);
        restore_page_scroll(Page::Menu);
    }

    void show_ir_device_select()
    {
        _page = Page::IrDeviceSelect;
        update_header_chrome(kTitleIrSelect, false);
        clear_content();

        _ir_devices = ordered_panel_devices();
        if (_ir_devices.empty()) {
            _ir_devices.push_back("tv");
        }

        _ir_device_labels.clear();
        _ir_device_labels.reserve(_ir_devices.size());
        for (const auto& id : _ir_devices) {
            _ir_device_labels.push_back(device_label_en(id));
        }

        for (size_t i = 0; i < _ir_devices.size(); ++i) {
            const int col          = static_cast<int>(i) % kGridCols;
            const int row          = static_cast<int>(i) / kGridCols;
            const int device_index = static_cast<int>(i);
            const int y            = 4 + row * (kBtnListH + kBtnGap);
            const size_t row_start = static_cast<size_t>(row) * kGridCols;
            const int cells_in_row =
                static_cast<int>(std::min(_ir_devices.size() - row_start, static_cast<size_t>(kGridCols)));
            const int x_offset = grid_column_x_offset(col, cells_in_row);

            auto btn = std::make_unique<Button>(_scroll->get());
            setup_grid_button(*btn, x_offset, y);
            btn->label().setText(_ir_device_labels[i].c_str());
            btn->onClick().connect([this, device_index]() {
                _selected_ir_device_index = device_index;
                queue_action(PendingAction::ShowIrControl);
            });
            _menu_buttons.push_back(std::move(btn));
        }

        const int num_rows   = (static_cast<int>(_ir_devices.size()) + kGridCols - 1) / kGridCols;
        const int content_bottom = 4 + (num_rows - 1) * (kBtnListH + kBtnGap) + kBtnListH;
        finish_scroll_layout(content_bottom);
        restore_page_scroll(Page::IrDeviceSelect);
    }

    void show_ir_control()
    {
        _page = Page::IrControl;
        clear_content();

        if (_ir_devices.empty()) {
            show_ir_device_select();
            return;
        }

        const int di = std::min<int>(_selected_ir_device_index, static_cast<int>(_ir_devices.size()) - 1);
        _selected_ir_device_index = di;
        const std::string& device_label = _ir_device_labels.empty() ? device_label_en(_ir_devices[di])
                                                                    : _ir_device_labels[di];
        update_header_chrome(device_label.c_str(), false);

        _btn_ir_on = std::make_unique<Button>(_scroll->get());
        _btn_ir_off = std::make_unique<Button>(_scroll->get());
        setup_centered_pair_buttons(*_btn_ir_on, *_btn_ir_off, 4);
        _btn_ir_on->label().setText(kBtnOn);
        _btn_ir_on->onClick().connect([this]() { queue_action(PendingAction::SendIrOn); });
        _btn_ir_off->label().setText(kBtnOff);
        _btn_ir_off->onClick().connect([this]() { queue_action(PendingAction::SendIrOff); });
        finish_scroll_layout(4 + kBtnListH);
        restore_page_scroll(Page::IrControl);
    }

    void send_ir(bool on)
    {
        if (_ir_devices.empty()) {
            view::pop_a_toast(kToastNoIr, view::ToastType::Error);
            return;
        }
        const int di = std::min<int>(_selected_ir_device_index, static_cast<int>(_ir_devices.size()) - 1);
        const std::string_view device = _ir_devices[di];
        const std::string_view action = on ? GetOnAction(device) : GetOffAction(device);
        const bool ok                 = SendAction(device, action);
        if (ok) {
            view::pop_a_toast(fmt::format("IR {} {}", on ? "ON" : "OFF", device_label_en(device)),
                              view::ToastType::Success, 1500);
        } else {
            view::pop_a_toast(kToastIrFailed, view::ToastType::Error, 1500);
        }
    }

    void update_servo_button_styles()
    {
        const bool hold = IsServoHoldEnabled();
        if (_btn_servo_hold_on) {
            style_list_button(*_btn_servo_hold_on, kBtnListW);
            apply_selection_outline(*_btn_servo_hold_on, hold);
        }
        if (_btn_servo_hold_off) {
            style_list_button(*_btn_servo_hold_off, kBtnListW);
            apply_selection_outline(*_btn_servo_hold_off, !hold);
        }
    }

    FeatureRunMode current_feature_mode(FeatureSettingKind kind) const
    {
        return kind == FeatureSettingKind::FaceFollow ? GetFaceFollowMode() : GetMusicDanceMode();
    }

    void set_feature_mode(FeatureSettingKind kind, FeatureRunMode mode)
    {
        if (kind == FeatureSettingKind::FaceFollow) {
            SetFaceFollowMode(mode);
        } else {
            SetMusicDanceMode(mode);
        }
    }

    void update_feature_mode_button_styles()
    {
        const FeatureRunMode active = current_feature_mode(_feature_setting_kind);
        for (size_t i = 0; i < _feature_mode_buttons.size() && i < 3; ++i) {
            style_list_button(*_feature_mode_buttons[i], kBtnListW);
            apply_selection_outline(*_feature_mode_buttons[i], active == kFeatureModeUiOrder[i]);
        }
    }

    void show_feature_mode_page(FeatureSettingKind kind)
    {
        _feature_setting_kind = kind;
        _page                 = kind == FeatureSettingKind::FaceFollow ? Page::FaceFollowMode : Page::MusicDanceMode;
        update_header_chrome(kind == FeatureSettingKind::FaceFollow ? kTitleFaceFollow : kTitleMusicDance, false);
        clear_content();

        int y = 4;
        for (size_t i = 0; i < 3; ++i) {
            const FeatureRunMode mode = kFeatureModeUiOrder[i];
            auto btn                  = std::make_unique<Button>(_scroll->get());
            setup_list_button(*btn, y);
            btn->label().setText(kFeatureModeUiLabels[i]);
            btn->onClick().connect([this, kind, mode]() {
                set_feature_mode(kind, mode);
                update_feature_mode_button_styles();
            });
            _feature_mode_buttons.push_back(std::move(btn));
            y += kBtnListH + kBtnGap;
        }

        update_feature_mode_button_styles();
        finish_scroll_layout(4 + (kBtnListH + kBtnGap) * 2 + kBtnListH);
        restore_page_scroll(_page);
        raise_header_layer();
    }

    void update_idle_motion_label(uint8_t level)
    {
        if (!_label_idle_motion_value) {
            return;
        }
        if (level >= kIdleMotionFreqLabels.size()) {
            level = static_cast<uint8_t>(kIdleMotionFreqLabels.size() - 1);
        }
        _label_idle_motion_value->setText(kIdleMotionFreqLabels[level]);
    }

    void show_servo()
    {
        _page = Page::Servo;
        update_header_chrome(kTitleServo, false);
        clear_content();

        _btn_servo_hold_on = std::make_unique<Button>(_scroll->get());
        setup_list_button(*_btn_servo_hold_on, 4);
        _btn_servo_hold_on->label().setText(kBtnServoHoldOn);
        _btn_servo_hold_on->onClick().connect([this]() { queue_action(PendingAction::ServoHoldOn); });

        _btn_servo_hold_off = std::make_unique<Button>(_scroll->get());
        setup_list_button(*_btn_servo_hold_off, 4 + kBtnListH + kBtnGap);
        _btn_servo_hold_off->label().setText(kBtnServoHoldOff);
        _btn_servo_hold_off->onClick().connect([this]() { queue_action(PendingAction::ServoHoldOff); });

        _btn_servo_home = std::make_unique<Button>(_scroll->get());
        setup_list_button(*_btn_servo_home, 4 + (kBtnListH + kBtnGap) * 2);
        apply_home_button_style(*_btn_servo_home);
        _btn_servo_home->label().setText(kBtnServoHome);
        _btn_servo_home->onClick().connect([this]() { queue_action(PendingAction::ServoGoHome); });

        _label_idle_motion_title = std::make_unique<Label>(_scroll->get());
        _label_idle_motion_title->setText(kLabelIdleFreq);
        _label_idle_motion_title->setTextFont(&lv_font_montserrat_16);
        _label_idle_motion_title->setTextColor(lv_color_hex(kColorTextPrimary));
        _label_idle_motion_title->setWidth(kBtnListW);
        _label_idle_motion_title->setTextAlign(LV_TEXT_ALIGN_CENTER);
        _label_idle_motion_title->align(LV_ALIGN_TOP_MID, 0, 188);

        _label_idle_motion_value = std::make_unique<Label>(_scroll->get());
        _label_idle_motion_value->setTextFont(&lv_font_montserrat_24);
        _label_idle_motion_value->setTextColor(lv_color_hex(kColorTextPrimary));
        _label_idle_motion_value->align(LV_ALIGN_TOP_MID, 0, 212);

        const uint8_t slider_value = static_cast<uint8_t>(std::clamp<int>(GetIdleMotionFreqPreset(), 0, 4));
        _idle_freq_applied = static_cast<int>(slider_value);
        _idle_freq_pending = -1;
        update_idle_motion_label(slider_value);

        _slider_idle_motion = std::make_unique<Slider>(_scroll->get());
        _slider_idle_motion->align(LV_ALIGN_TOP_MID, 0, 248);
        _slider_idle_motion->setRange(0, static_cast<int32_t>(kIdleMotionFreqLabels.size() - 1));
        _slider_idle_motion->setSize(250, 18);
        _slider_idle_motion->setBgColor(lv_color_hex(0x615B9E), LV_PART_KNOB);
        _slider_idle_motion->setBgColor(lv_color_hex(0x615B9E), LV_PART_INDICATOR);
        _slider_idle_motion->setBgColor(lv_color_hex(0xB8D3FD), LV_PART_MAIN);
        _slider_idle_motion->setBgOpa(255);
        _slider_idle_motion->setValue(slider_value);
        _slider_idle_motion->onValueChanged().connect([this](int32_t value) {
            const int preset = std::clamp<int32_t>(value, 0, static_cast<int32_t>(kIdleMotionFreqLabels.size() - 1));
            _idle_freq_pending = preset;
            ScheduleIdleMotionFreqSave(400);
        });

        update_servo_button_styles();

        finish_scroll_layout(248 + 18);
        restore_page_scroll(Page::Servo);
        raise_header_layer();
    }

    void set_servo_hold(bool enabled)
    {
        SetServoHoldEnabled(enabled);
        update_servo_button_styles();
    }

    void update_espnow_button_styles()
    {
        const bool enabled = IsEspNowRemoteEnabled();
        if (_btn_espnow_on) {
            style_list_button(*_btn_espnow_on, kBtnListW);
            apply_selection_outline(*_btn_espnow_on, enabled);
        }
        if (_btn_espnow_off) {
            style_list_button(*_btn_espnow_off, kBtnListW);
            apply_selection_outline(*_btn_espnow_off, !enabled);
        }
    }

    void set_espnow_remote_enabled(bool enabled)
    {
        SetEspNowRemoteEnabled(enabled);
        update_espnow_button_styles();
        view::pop_a_toast(enabled ? "Remote ON" : "Remote OFF", view::ToastType::Info, 1200);
    }

    void show_espnow_remote()
    {
        _page = Page::EspNowRemote;
        update_header_chrome(kTitleEspNowRemote, false);
        clear_content();

        _btn_espnow_on = std::make_unique<Button>(_scroll->get());
        setup_list_button(*_btn_espnow_on, 4);
        _btn_espnow_on->label().setText(kBtnEspNowOn);
        _btn_espnow_on->onClick().connect([this]() { queue_action(PendingAction::EspNowRemoteOn); });

        _btn_espnow_off = std::make_unique<Button>(_scroll->get());
        setup_list_button(*_btn_espnow_off, 4 + kBtnListH + kBtnGap);
        _btn_espnow_off->label().setText(kBtnEspNowOff);
        _btn_espnow_off->onClick().connect([this]() { queue_action(PendingAction::EspNowRemoteOff); });

        update_espnow_button_styles();
        finish_scroll_layout(4 + (kBtnListH + kBtnGap) + kBtnListH);
        restore_page_scroll(Page::EspNowRemote);
        raise_header_layer();
    }

    void show_backend()
    {
        _page = Page::AiBackend;
        update_header_chrome(kTitleAi, false);
        clear_content();

        const ProfileId active = GetActiveProfile();
        int selected = 0;
        for (size_t i = 0; i < kProfileCount; ++i) {
            if (kProfiles[i].id == active) {
                selected = static_cast<int>(i);
                break;
            }
        }

        _backend_opts.clear();
        for (size_t i = 0; i < kProfileCount; ++i) {
            _backend_opts += kProfiles[i].label_en;
            if (i + 1 < kProfileCount) {
                _backend_opts += "\n";
            }
        }

        _backend_roller = std::make_unique<Roller>(_scroll->get());
        _backend_roller->setSize(kBtnListW, 64);
        _backend_roller->align(LV_ALIGN_TOP_MID, 0, 4);
        _backend_roller->setOptions(_backend_opts.c_str());
        apply_roller_style(*_backend_roller);
        _backend_roller->setSelected(static_cast<uint32_t>(selected));
        _backend_roller->onValueChanged().connect([this](int32_t v) { update_backend_preview(static_cast<int>(v)); });

        _backend_url_label = std::make_unique<Label>(_scroll->get());
        _backend_url_label->setWidth(kBtnListW);
        _backend_url_label->setLongMode(LV_LABEL_LONG_WRAP);
        _backend_url_label->setTextFont(&font_puhui_basic_20_4);
        _backend_url_label->setTextColor(lv_color_hex(kColorTextPrimary));
        _backend_url_label->align(LV_ALIGN_TOP_MID, 0, 76);
        update_backend_preview(selected);

        _page_action_btn = std::make_unique<Button>(_scroll->get());
        setup_list_button(*_page_action_btn, 148);
        _page_action_btn->label().setText(kBtnApply);
        _page_action_btn->onClick().connect([this]() {
            if (_backend_roller) {
                const int index = static_cast<int>(_backend_roller->getSelected());
                _pending_profile =
                    (index >= 0 && index < static_cast<int>(kProfileCount)) ? kProfiles[index].id : ProfileId::Cloud;
            }
            queue_action(PendingAction::ApplyBackend);
        });

        finish_scroll_layout(148 + kBtnListH);
        restore_page_scroll(Page::AiBackend);
    }

    void open_system_settings()
    {
        hide();
        open_addon_setup_overlay();
        mclog::tagInfo(_tag, "open system settings overlay");
    }

    void start_firmware_update()
    {
        if (g_fw_ota_task_running.load()) {
            return;
        }
        hide();
        view::pop_a_toast("Checking firmware...", view::ToastType::Info, 2000);
        g_fw_ota_task_running.store(true);
        if (xTaskCreate(firmware_ota_task, "fw_ota", 8192, nullptr, 2, nullptr) != pdPASS) {
            g_fw_ota_task_running.store(false);
            view::pop_a_toast(kToastOtaFailed, view::ToastType::Error, 3000);
        }
    }

    void update_backend_preview(int index)
    {
        if (!_backend_url_label) {
            return;
        }
        const ProfileId profile =
            (index >= 0 && index < static_cast<int>(kProfileCount)) ? kProfiles[index].id : ProfileId::Cloud;
        const std::string url = GetOtaUrl(profile);
        _backend_url_text     = fmt::format("{}{}", kOtaPrefix, url);
        _backend_url_label->setText(_backend_url_text.c_str());
    }

    void apply_backend()
    {
        if (g_apply_task_running.load()) {
            return;
        }

        const ProfileId profile = _pending_profile;

        hide();
        view::pop_a_toast(kToastApplying, view::ToastType::Info, 2000);

        if (!ApplyProfile(profile, false)) {
            view::pop_a_toast(kToastOtaFailed, view::ToastType::Error, 3000);
            return;
        }

        g_apply_task_running.store(true);
        auto* profile_param = new ProfileId(profile);
        if (xTaskCreate(apply_backend_task, "addon_apply", 6144, profile_param, 2, nullptr) != pdPASS) {
            delete profile_param;
            g_apply_task_running.store(false);
            view::pop_a_toast(kToastOtaFailed, view::ToastType::Error, 3000);
            mclog::tagError(_tag, "failed to create apply task");
        }
    }
};

static std::unique_ptr<AddonPanel> _panel;

}  // namespace

void create_addon_panel(lv_obj_t* parent)
{
    _panel = std::make_unique<AddonPanel>();
    _panel->init(parent);
}

void update_addon_panel_gesture()
{
    if (_panel) {
        _panel->update_gesture();
    }
}

void update_addon_panel()
{
    if (_panel) {
        _panel->update_actions();
    }
}

void destroy_addon_panel()
{
    _panel.reset();
}

bool is_addon_panel_active()
{
    return _panel && _panel->isOpen();
}

bool is_addon_ui_modal_active()
{
    return is_addon_panel_active() || is_addon_setup_overlay_active() || is_addon_screensaver_active();
}

bool blocks_agent_tap_to_talk()
{
    const uint32_t now = GetHAL().millis();
    if (g_edge_gesture_tracking && g_edge_gesture_tracking_started_ms > 0 &&
        now - g_edge_gesture_tracking_started_ms > kEdgeGestureTimeoutMs) {
        g_edge_gesture_tracking            = false;
        g_edge_gesture_tracking_started_ms = 0;
        sync_agent_screen_tap_target(true);
    }
    if (is_addon_ui_modal_active()) {
        return true;
    }
    if (g_edge_gesture_tracking) {
        return true;
    }
    return now < g_tap_suppress_until_ms;
}

}  // namespace stackchan::addons
