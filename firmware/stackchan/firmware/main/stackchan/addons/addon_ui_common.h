/*

 * StackChan custom: UI helpers mirroring app_setup/view/view.cpp (SelectMenuPage).

 * SPDX-License-Identifier: MIT

 */

#pragma once



#include <lvgl.h>

#include <smooth_lvgl.hpp>



LV_FONT_DECLARE(font_puhui_basic_20_4);

LV_FONT_DECLARE(lv_font_montserrat_24);



namespace stackchan::addons::ui {



/** Match app_setup SelectMenuPage */

inline constexpr int kScreenW    = 320;

inline constexpr int kScreenH    = 240;

inline constexpr int kBtnListW   = 282;

inline constexpr int kBtnListH   = 48;

inline constexpr int kBtnPairW   = 112;

inline constexpr int kBtnPairH   = 48;

inline constexpr int kBtnRadius  = 18;

inline constexpr int kBtnGap     = 12;

inline constexpr int kSidePad    = (kScreenW - kBtnListW) / 2;

/** Header band height (scroll area starts below this). */
inline constexpr int kHeaderH = 40;

/** Title / version / Back Y on the drawer (screen coordinates). */
inline constexpr int kHeaderRowH  = 30;
inline constexpr int kHeaderTextY = 6;

inline constexpr int kScrollTopY = kHeaderH;

inline constexpr int kScrollH    = kScreenH - kScrollTopY;

/** Bottom margin below the last control (always applied). */
inline constexpr int kScrollBottomPad = 32;

/** Content shorter than this % of the viewport = lots of empty space (no scrollbar). */
inline constexpr int kScrollEmptyFillPercent = 50;

/** Enable scroll when content+pad exceeds viewport by less than this (px). */
inline constexpr int kScrollEnableSlack = 20;

inline constexpr int kGridCols   = 2;

inline constexpr int kGridGap    = 8;

inline constexpr int kGridCellW  = (kBtnListW - kGridGap * (kGridCols - 1)) / kGridCols;

inline constexpr int kBtnHeaderW = 80;

inline constexpr int kBtnHeaderH = kHeaderRowH;

/** Title area ends before the header Back button (aligned with list right edge). */
inline constexpr int kHeaderBackX = kSidePad + kBtnListW - kBtnHeaderW;

inline constexpr int kTitleMaxW = kHeaderBackX - kSidePad - 8;



inline constexpr uint32_t kColorBgPanel       = 0xEDF4FF;

inline constexpr uint32_t kColorBgButton      = 0xB8D3FD;

inline constexpr uint32_t kColorBgSecondary   = 0xD4D9E0;

inline constexpr uint32_t kColorBgHome        = 0xC8E6C9;

inline constexpr uint32_t kColorTextPrimary   = 0x26206A;

inline constexpr uint32_t kColorTextMuted     = 0x6A6882;

inline constexpr uint32_t kColorTextSecondary = 0x525064;

inline constexpr uint32_t kColorTextHome      = 0x1B5E20;



inline const lv_font_t* kUiFont()

{

    return &lv_font_montserrat_24;

}



inline void style_list_button(smooth_ui_toolkit::lvgl_cpp::Button& btn, int btn_width)

{

    btn.setBgColor(lv_color_hex(kColorBgButton));

    btn.setBorderWidth(0);

    btn.setShadowWidth(0);

    btn.setRadius(kBtnRadius);



    auto& label = btn.label();

    label.setTextFont(kUiFont());

    label.setTextColor(lv_color_hex(kColorTextPrimary));

    label.align(LV_ALIGN_CENTER, 0, 0);

    label.setWidth(btn_width - 12);

    label.setTextAlign(LV_TEXT_ALIGN_CENTER);

    label.setLongMode(LV_LABEL_LONG_MODE_SCROLL_CIRCULAR);

}



inline void setup_list_button(smooth_ui_toolkit::lvgl_cpp::Button& btn, int y)

{

    btn.setSize(kBtnListW, kBtnListH);

    btn.align(LV_ALIGN_TOP_MID, 0, y);

    style_list_button(btn, kBtnListW);

}



inline void setup_pair_button(smooth_ui_toolkit::lvgl_cpp::Button& btn, int x_offset, int y)

{

    btn.setSize(kBtnPairW, kBtnPairH);

    btn.align(LV_ALIGN_TOP_MID, x_offset, y);

    style_list_button(btn, kBtnPairW);

}



inline void setup_centered_pair_buttons(smooth_ui_toolkit::lvgl_cpp::Button& on_btn,

                                      smooth_ui_toolkit::lvgl_cpp::Button& off_btn,

                                      int y)

{

    const int half_span = kBtnPairW / 2 + kBtnGap / 2;

    setup_pair_button(on_btn, -half_span, y);

    setup_pair_button(off_btn, half_span, y);

}



/** Place a grid cell centered like list buttons (x_offset from TOP_MID). */
inline void setup_grid_button(smooth_ui_toolkit::lvgl_cpp::Button& btn, int x_offset, int y)
{
    btn.setSize(kGridCellW, kBtnListH);
    btn.align(LV_ALIGN_TOP_MID, x_offset, y);
    style_list_button(btn, kGridCellW);
}

inline int grid_column_x_offset(int col, int cells_in_row)
{
    if (cells_in_row <= 1) {
        return 0;
    }
    const int half_span = kGridCellW / 2 + kGridGap / 2;
    return (col == 0) ? -half_span : half_span;
}



inline void setup_header_back_button(smooth_ui_toolkit::lvgl_cpp::Button& btn)

{

    btn.setSize(kBtnHeaderW, kBtnHeaderH);

    btn.align(LV_ALIGN_TOP_LEFT, kHeaderBackX, kHeaderTextY);

    style_list_button(btn, kBtnHeaderW);

}



inline void setup_header_title_label(smooth_ui_toolkit::lvgl_cpp::Label& label)

{

    label.align(LV_ALIGN_TOP_LEFT, kSidePad, kHeaderTextY);

    label.setWidth(kTitleMaxW);

}



inline void apply_secondary_button_style(smooth_ui_toolkit::lvgl_cpp::Button& btn, int btn_width)

{

    btn.setBgColor(lv_color_hex(kColorBgSecondary));

    btn.label().setTextColor(lv_color_hex(kColorTextSecondary));

    btn.label().setWidth(btn_width - 12);

}



inline void apply_home_button_style(smooth_ui_toolkit::lvgl_cpp::Button& btn)

{

    btn.setBgColor(lv_color_hex(kColorBgHome));

    btn.label().setTextColor(lv_color_hex(kColorTextHome));

}



/** Selected list option: keep fill color, highlight border only. */

inline void apply_selection_outline(smooth_ui_toolkit::lvgl_cpp::Button& btn, bool selected)

{

    if (selected) {

        btn.setBorderWidth(2);

        btn.setBorderColor(lv_color_hex(kColorTextPrimary));

    } else {

        btn.setBorderWidth(0);

    }

}



inline void setup_scroll_panel(smooth_ui_toolkit::lvgl_cpp::Container& panel)

{

    panel.setSize(kScreenW, kScrollH);

    panel.align(LV_ALIGN_TOP_MID, 0, kScrollTopY);

    panel.setBgOpa(0);

    panel.setBorderWidth(0);

    panel.setScrollDir(LV_DIR_VER);

    panel.setScrollbarMode(LV_SCROLLBAR_MODE_OFF);

    panel.removeFlag(LV_OBJ_FLAG_SCROLLABLE);

}



/** True when the page is mostly empty (e.g. IR ON/OFF) — hide scrollbar. */
inline bool scroll_content_mostly_empty(int content_bottom_y)

{

    if (kScrollH <= 0) {

        return true;

    }

    return (content_bottom_y * 100) < (kScrollH * kScrollEmptyFillPercent);

}



/** Servo / main menu: content fills the panel — allow scroll + bar (with bottom pad). */
inline bool scroll_content_needs_scroll(int content_bottom_y)

{

    if (scroll_content_mostly_empty(content_bottom_y)) {

        return false;

    }

    const int total_h = content_bottom_y + kScrollBottomPad;

    return total_h > (kScrollH - kScrollEnableSlack);

}



inline void apply_scroll_content_fit(smooth_ui_toolkit::lvgl_cpp::Container& panel, bool needs_scroll)

{

    if (!needs_scroll) {

        panel.setScrollbarMode(LV_SCROLLBAR_MODE_OFF);

        panel.removeFlag(LV_OBJ_FLAG_SCROLLABLE);

        lv_obj_scroll_to_y(panel.get(), 0, LV_ANIM_OFF);

        return;

    }

    panel.addFlag(LV_OBJ_FLAG_SCROLLABLE);

    panel.setScrollDir(LV_DIR_VER);

    panel.setScrollbarMode(LV_SCROLLBAR_MODE_ACTIVE);

}




inline void apply_roller_style(smooth_ui_toolkit::lvgl_cpp::Roller& roller)

{

    roller.setTextFont(kUiFont());

    roller.setBgColor(lv_color_hex(kColorBgButton));

    roller.setBgColor(lv_color_hex(0x615B9E), LV_PART_SELECTED);

    roller.setRadius(kBtnRadius);

}



}  // namespace stackchan::addons::ui

