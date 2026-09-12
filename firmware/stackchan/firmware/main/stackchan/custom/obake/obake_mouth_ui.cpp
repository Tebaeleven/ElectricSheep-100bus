/*
 * アバターの目口を隠し、白キャンバスに ∪/∩・cm / ALT_CM・STA IP を描く。
 */
#include "obake_mouth_ui.h"

#include "obake_config.h"
#include "obake_eyes.h"
#include "obake_pahub.h"
#include "obake_tof.h"
#include "obake_wake_config.h"

#include <stackchan/avatar/skins/default/default.h>
#include <stackchan/stackchan.h>

#include <cmath>
#include <cstdio>
#include <esp_heap_caps.h>
#include <esp_log.h>
#include <esp_netif.h>
#include <esp_timer.h>
#include <lvgl.h>
#include <string.h>

namespace stackchan::obake {
namespace {

const char* TAG = "obake_mouth";
constexpr int kW = 320;
constexpr int kH = 240;
constexpr uint16_t kWhite = 0xFFFF;
constexpr uint16_t kBlack = 0x0000;

lv_obj_t* s_canvas = nullptr;
lv_obj_t* s_label_tl = nullptr;
lv_obj_t* s_label_tr = nullptr;
lv_obj_t* s_label_bl = nullptr;
/** STA IP 用（タップ非奪取。ホームボタンより前面にしない） */
lv_obj_t* s_label_ip = nullptr;
uint16_t* s_buf = nullptr;
int s_drawn_cm = -2;
bool s_drawn_smile = false;
/** 標準顔・吹き出しの保険隠しを間引くための次回時刻 (ms) */
uint32_t s_next_hide_ms = 0;
/** IP 再読取間隔（DHCP 変動・接続遅れに追従） */
uint32_t s_next_ip_ms = 0;
char s_ip_text[24] = "--";

uint32_t now_ms()
{
    return static_cast<uint32_t>(esp_timer_get_time() / 1000ULL);
}

/** 走査線で楕円塗り（画素二重ループを避ける） */
void fill_ellipse(uint16_t* buf, int cx, int cy, int rx, int ry, uint16_t color)
{
    if (rx <= 0 || ry <= 0) {
        return;
    }
    const long rx2 = static_cast<long>(rx) * rx;
    const long ry2 = static_cast<long>(ry) * ry;
    for (int y = -ry; y <= ry; ++y) {
        const int py = cy + y;
        if (py < 0 || py >= kH) {
            continue;
        }
        const long yy = static_cast<long>(y) * y;
        const long numer = rx2 * (ry2 - yy);
        if (numer < 0) {
            continue;
        }
        const int x_span = static_cast<int>(std::lround(std::sqrt(static_cast<double>(numer) / static_cast<double>(ry2))));
        int x0 = cx - x_span;
        int x1 = cx + x_span;
        if (x1 < 0 || x0 >= kW) {
            continue;
        }
        if (x0 < 0) {
            x0 = 0;
        }
        if (x1 >= kW) {
            x1 = kW - 1;
        }
        uint16_t* row = buf + py * kW;
        for (int x = x0; x <= x1; ++x) {
            row[x] = color;
        }
    }
}

void paint_mouth(bool smile)
{
    if (!s_buf || !s_canvas) {
        return;
    }
    // RGB565 は 2 バイト/画素。0xFFFF 白を一括で埋める
    memset(s_buf, 0xFF, static_cast<size_t>(kW) * kH * sizeof(uint16_t));
    const int cx = kW / 2;
    const int cy = kH / 2 + 16;
    const int rx = 70;
    const int ry = 36;
    if (smile) {
        fill_ellipse(s_buf, cx, cy + 12, rx, ry, kBlack);
        fill_ellipse(s_buf, cx, cy - 10, rx + 6, ry, kWhite);
    } else {
        fill_ellipse(s_buf, cx, cy - 12, rx, ry, kBlack);
        fill_ellipse(s_buf, cx, cy + 10, rx + 6, ry, kWhite);
    }
    lv_obj_invalidate(s_canvas);
}

void update_status_labels(int cm)
{
    if (!s_label_tl || !s_label_tr || !s_label_bl) {
        return;
    }
    // P=ok / bus / probe。T/L/R は従来どおり
    lv_label_set_text_fmt(s_label_tl, "%s\nP%s T%s L%s R%s", kObakeUiLabel, PahubStatusTag(),
                          TofOk() ? "ok" : "--", EyesLeftOk() ? "ok" : "--", EyesRightOk() ? "ok" : "--");
    if (cm >= 0) {
        lv_label_set_text_fmt(s_label_tr, "%3d cm", cm);
        lv_label_set_text_fmt(s_label_bl, "ALT_CM=%d", cm);
    } else {
        lv_label_set_text(s_label_tr, "-- cm");
        lv_label_set_text(s_label_bl, "ALT_CM=----");
    }
}

/** STA IPv4 を読み、IP ラベルを更新（未接続時は --） */
void update_ip_label()
{
    if (!s_label_ip) {
        return;
    }
    char buf[24] = "--";
    esp_netif_t* netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    if (netif != nullptr) {
        esp_netif_ip_info_t ip{};
        if (esp_netif_get_ip_info(netif, &ip) == ESP_OK && ip.ip.addr != 0) {
            std::snprintf(buf, sizeof(buf), IPSTR, IP2STR(&ip.ip));
        }
    }
    if (std::strcmp(buf, s_ip_text) == 0) {
        return;
    }
    std::snprintf(s_ip_text, sizeof(s_ip_text), "%s", buf);
    // 端末サーバ接続用に STA IP を常時表示（タップは奪わない）
    lv_label_set_text_fmt(s_label_ip, "IP %s", s_ip_text);
}

void set_default_face_hidden(bool hide)
{
    auto& stackchan = GetStackChan();
    if (!stackchan.hasAvatar()) {
        return;
    }
    stackchan.avatar().leftEye().setVisible(!hide);
    stackchan.avatar().rightEye().setVisible(!hide);
    stackchan.avatar().mouth().setVisible(!hide);
}

/** 吹き出しは不要。SetStatus で再表示されても隠す */
void hide_speech_bubble()
{
    auto& stackchan = GetStackChan();
    if (!stackchan.hasAvatar()) {
        return;
    }
    stackchan.avatar().clearSpeech();
    if (auto* bubble = stackchan.avatar().getKeyElements().speechBubble.get()) {
        bubble->setVisible(false);
    }
}

/** 標準顔・吹き出しを隠し直し、接続状況ラベルも更新する */
void ensure_obake_overlay()
{
    set_default_face_hidden(true);
    hide_speech_bubble();
    // P/T/L/R・cm は継続表示。HW 状態変化を画面に反映する
    const int cm = TofLastCm();
    update_status_labels(cm);
    s_drawn_cm = cm;
    s_next_hide_ms = now_ms() + kMouthHideRetryMs;
}

lv_obj_t* make_label(lv_obj_t* parent, lv_align_t align, int x, int y)
{
    lv_obj_t* lab = lv_label_create(parent);
    lv_obj_set_style_text_color(lab, lv_color_hex(0x555555), 0);
    lv_obj_set_style_text_font(lab, &lv_font_montserrat_16, 0);
    lv_obj_align(lab, align, x, y);
    // 距離ラベルはタップを奪わない（下スワイプホーム用）
    lv_obj_clear_flag(lab, LV_OBJ_FLAG_CLICKABLE);
    return lab;
}

}  // namespace

void MouthUiCreate()
{
    // 再 Start 時も標準目口が被らないよう、既存キャンバスなら隠し直し＋状態更新
    if (s_canvas) {
        ensure_obake_overlay();
        return;
    }
    auto& stackchan = GetStackChan();
    if (!stackchan.hasAvatar()) {
        ESP_LOGW(TAG, "no avatar");
        return;
    }
    auto* def = dynamic_cast<stackchan::avatar::DefaultAvatar*>(&stackchan.avatar());
    if (!def || !def->getPanel()) {
        ESP_LOGW(TAG, "DefaultAvatar panel missing");
        return;
    }

    ensure_obake_overlay();
    def->getPanel()->setBgColor(lv_color_white());

    lv_obj_t* parent = def->getPanel()->get();
    const size_t bytes = static_cast<size_t>(kW) * kH * sizeof(uint16_t);
    s_buf = static_cast<uint16_t*>(heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!s_buf) {
        s_buf = static_cast<uint16_t*>(heap_caps_malloc(bytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT));
    }
    if (!s_buf) {
        // 確保失敗時のみ標準顔を戻す（口 UI 未表示のため）
        ESP_LOGE(TAG, "canvas buffer alloc failed");
        set_default_face_hidden(false);
        return;
    }

    s_canvas = lv_canvas_create(parent);
    lv_canvas_set_buffer(s_canvas, s_buf, kW, kH, LV_COLOR_FORMAT_RGB565);
    lv_obj_set_size(s_canvas, kW, kH);
    lv_obj_align(s_canvas, LV_ALIGN_CENTER, 0, 0);
    // キャンバスは背面。下スワイプ／タップを奪わない
    lv_obj_clear_flag(s_canvas, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_move_background(s_canvas);

    s_label_tl = make_label(parent, LV_ALIGN_TOP_LEFT, 6, 6);
    s_label_tr = make_label(parent, LV_ALIGN_TOP_RIGHT, -6, 6);
    s_label_bl = make_label(parent, LV_ALIGN_BOTTOM_LEFT, 6, -6);
    // 下中央: STA IP（ホームボタン帯と重ならないよう少し上）
    s_label_ip = make_label(parent, LV_ALIGN_BOTTOM_MID, 0, -36);
    lv_obj_set_style_text_color(s_label_tr, lv_color_black(), 0);
    lv_obj_set_style_text_color(s_label_ip, lv_color_hex(0x222222), 0);
    lv_obj_move_foreground(s_label_tl);
    lv_obj_move_foreground(s_label_tr);
    lv_obj_move_foreground(s_label_bl);
    lv_obj_move_foreground(s_label_ip);

    s_drawn_cm = -2;
    s_drawn_smile = true;
    s_next_ip_ms = 0;
    s_ip_text[0] = '\0';
    paint_mouth(true);
    update_status_labels(-1);
    update_ip_label();
    ESP_LOGI(TAG, "mouth UI ready (wake=%s)", kWakeDisplayName);
}

void MouthUiDestroy()
{
    // RuntimeStop / OnHalInit からは呼ばない想定。呼んでも標準目口は戻さない
    // （CUSTOM 中に Stack-chan 標準顔でおばけ口を潰さない）
    if (s_label_tl) {
        lv_obj_del(s_label_tl);
        s_label_tl = nullptr;
    }
    if (s_label_tr) {
        lv_obj_del(s_label_tr);
        s_label_tr = nullptr;
    }
    if (s_label_bl) {
        lv_obj_del(s_label_bl);
        s_label_bl = nullptr;
    }
    if (s_label_ip) {
        lv_obj_del(s_label_ip);
        s_label_ip = nullptr;
    }
    if (s_canvas) {
        lv_obj_del(s_canvas);
        s_canvas = nullptr;
    }
    if (s_buf) {
        heap_caps_free(s_buf);
        s_buf = nullptr;
    }
    // set_default_face_hidden(false) はしない — パネルは白のまま
    s_drawn_cm = -2;
    s_next_hide_ms = 0;
    s_next_ip_ms = 0;
    s_ip_text[0] = '\0';
}

void MouthUiUpdate()
{
    if (!s_canvas || !s_buf) {
        return;
    }
    // 毎フレームの avatar 操作は重いので、保険間隔だけ隠し直す
    if (now_ms() >= s_next_hide_ms) {
        ensure_obake_overlay();
    }
    // DHCP / 接続遅れに合わせ IP を間欠更新（ホーム前面は home_indicator 側で担保）
    if (now_ms() >= s_next_ip_ms) {
        s_next_ip_ms = now_ms() + 2000;
        update_ip_label();
    }
    const bool smile = EyesMouthSmile();
    const int cm = TofLastCm();
    if (smile != s_drawn_smile) {
        paint_mouth(smile);
        s_drawn_smile = smile;
    }
    if (cm != s_drawn_cm) {
        s_drawn_cm = cm;
        update_status_labels(cm);
    }
}

}  // namespace stackchan::obake
