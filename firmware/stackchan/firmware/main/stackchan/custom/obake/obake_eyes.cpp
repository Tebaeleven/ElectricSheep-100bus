/*
 * 左右 OLED: 縦長黒楕円・閉眼∪/∩・SH1106 132列白埋め・ページ交互送信。
 * まばたき／きょろきょろ／明るさは obake_config.h 先頭の定数のみ触る。
 */
#include "obake_eyes.h"

#include "obake_config.h"
#include "obake_pahub.h"

#include <atomic>
#include <cmath>
#include <esp_log.h>
#include <esp_random.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <string.h>

namespace stackchan::obake {
namespace {

const char* TAG = "obake_eyes";
bool s_left_ok = false;
bool s_right_ok = false;
uint8_t s_left_addr = kOledAddr;
uint8_t s_right_addr = kOledAddr;
bool s_eyes_open = true;
/** hw タスク書き込み / UI 読み取り */
std::atomic<bool> s_mouth_smile{true};
int s_look_x = 0;
int s_look_y = 0;
uint32_t s_blink_at = 0;
uint32_t s_look_at = 0;
uint32_t s_mouth_at = 0;

/** Min + [0..Span] の乱数間隔（Span=0 なら Min 固定） */
uint32_t rand_span_ms(uint32_t min_ms, uint32_t span_ms)
{
    if (span_ms == 0) {
        return min_ms;
    }
    return min_ms + (esp_random() % (span_ms + 1));
}

bool oled_cmd(uint8_t addr, uint8_t cmd)
{
    uint8_t buf[2] = {0x00, cmd};
    return PahubWrite(addr, buf, 2);
}

bool oled_init(uint8_t addr)
{
    // 0x81 の次が contrast（kOledContrast）。他は SH1106 定番シーケンス
    const uint8_t kInit[] = {
        0xAE, 0xD5, 0xF0, 0xA8, 0x3F, 0xD3, 0x00, 0x40, 0x8D, 0x14, 0x20, 0x02,
        0xA1, 0xC8, 0xDA, 0x12, 0x81, kOledContrast, 0xD9, 0x22, 0xDB, 0x40, 0xA4, 0xA6, 0xAF,
    };
    for (uint8_t c : kInit) {
        if (!oled_cmd(addr, c)) {
            return false;
        }
    }
    vTaskDelay(pdMS_TO_TICKS(50));
    // SH1106 端の未書き込み黒しみ対策: 132 列を全面白
    uint8_t white[133];
    white[0] = 0x40;
    memset(white + 1, 0xFF, 132);
    for (int page = 0; page < 8; ++page) {
        uint8_t setcol[4] = {0x00, static_cast<uint8_t>(0xB0 | page), 0x00, 0x10};
        if (!PahubWrite(addr, setcol, 4)) {
            return false;
        }
        if (!PahubWrite(addr, white, 133)) {
            return false;
        }
    }
    return true;
}

void oled_send_page(uint8_t addr, const uint8_t* buf, int page)
{
    uint8_t setcol[4] = {0x00, static_cast<uint8_t>(0xB0 | page), 0x00, 0x10};
    PahubWrite(addr, setcol, 4);
    uint8_t row[133];
    row[0] = 0x40;
    memset(row + 1, 0xFF, 132);
    memcpy(row + 1 + kOledColOffset, buf + page * 128, 128);
    PahubWrite(addr, row, 133);
}

uint8_t find_oled_addr()
{
    if (PahubProbe(kOledAddr)) {
        return kOledAddr;
    }
    if (PahubProbe(kOledAddrAlt)) {
        return kOledAddrAlt;
    }
    for (uint8_t a = 0x08; a < 0x78; ++a) {
        if (a == kPahubAddr) {
            continue;
        }
        if (PahubProbe(a)) {
            return a;
        }
    }
    return 0;
}

void set_pixel(uint8_t* buf, int x, int y, bool on)
{
    if (x < 0 || x >= 128 || y < 0 || y >= 64) {
        return;
    }
    const int i = x + (y / 8) * 128;
    const uint8_t bit = static_cast<uint8_t>(1u << (y & 7));
    if (on) {
        buf[i] |= bit;
    } else {
        buf[i] &= static_cast<uint8_t>(~bit);
    }
}

void set_pixel_portrait(uint8_t* buf, int x, int y, bool on)
{
    int px;
    int py;
    if (kOledRotateCcw) {
        px = 127 - y;
        py = x;
    } else {
        px = y;
        py = 63 - x;
    }
    set_pixel(buf, px, py, on);
}

/** 走査線で楕円塗り（画素二重ループを避ける） */
void fill_ellipse_portrait(uint8_t* buf, int cx, int cy, int rx, int ry, bool on)
{
    if (rx <= 0 || ry <= 0) {
        return;
    }
    const long rx2 = static_cast<long>(rx) * rx;
    const long ry2 = static_cast<long>(ry) * ry;
    for (int y = -ry; y <= ry; ++y) {
        const long yy = static_cast<long>(y) * y;
        // rx^2 * (1 - y^2/ry^2) の平方根 → その行の半幅
        const long numer = rx2 * (ry2 - yy);
        if (numer < 0) {
            continue;
        }
        const int x_span = static_cast<int>(std::lround(std::sqrt(static_cast<double>(numer) / static_cast<double>(ry2))));
        for (int x = -x_span; x <= x_span; ++x) {
            set_pixel_portrait(buf, cx + x, cy + y, on);
        }
    }
}

void render_eye(uint8_t* buf, bool open, int look_x, int look_y, bool smile)
{
    memset(buf, 0xFF, 1024);
    if (open) {
        fill_ellipse_portrait(buf, 32 + look_x, 64 + look_y, 16, 40, false);
    } else {
        const int cx = 32;
        const int cy = 96;
        if (smile) {
            fill_ellipse_portrait(buf, cx, cy + 8, 22, 16, false);
            fill_ellipse_portrait(buf, cx, cy - 14, 26, 18, true);
        } else {
            fill_ellipse_portrait(buf, cx, cy - 8, 22, 16, false);
            fill_ellipse_portrait(buf, cx, cy + 14, 26, 18, true);
        }
    }
}

/** 左右同一絵なので1バッファを描画し、送信だけ両目へ */
void show_eyes(bool open)
{
    const bool smile = s_mouth_smile.load(std::memory_order_relaxed);
    uint8_t buf[1024];
    render_eye(buf, open, s_look_x, s_look_y, smile);
    // PaHub は同時不可。ページごとに左右連続で送り、ズレを抑える
    for (int page = 0; page < 8; ++page) {
        if (s_left_ok && PahubSelect(kChLeft)) {
            oled_send_page(s_left_addr, buf, page);
        }
        if (s_right_ok && PahubSelect(kChRight)) {
            oled_send_page(s_right_addr, buf, page);
        }
    }
}

void pick_look()
{
    // RangeR → オフセットは -Range .. +Range
    s_look_x = static_cast<int>(esp_random() % static_cast<uint32_t>(2 * kLookRangeX + 1)) - kLookRangeX;
    s_look_y = static_cast<int>(esp_random() % static_cast<uint32_t>(2 * kLookRangeY + 1)) - kLookRangeY;
}

void pick_mouth()
{
    s_mouth_smile.store((esp_random() & 1) != 0, std::memory_order_relaxed);
}

}  // namespace

bool EyesInit()
{
    s_left_ok = false;
    s_right_ok = false;
    if (!PahubOk()) {
        return false;
    }
    PahubLock();
    if (PahubSelect(kChLeft)) {
        s_left_addr = find_oled_addr();
        s_left_ok = (s_left_addr != 0) && oled_init(s_left_addr);
        ESP_LOGI(TAG, "CH0 oled 0x%02X %s", s_left_addr, s_left_ok ? "ok" : "fail");
    }
    if (PahubSelect(kChRight)) {
        s_right_addr = find_oled_addr();
        s_right_ok = (s_right_addr != 0) && oled_init(s_right_addr);
        ESP_LOGI(TAG, "CH1 oled 0x%02X %s", s_right_addr, s_right_ok ? "ok" : "fail");
    }
    pick_look();
    pick_mouth();
    s_eyes_open = true;
    show_eyes(true);
    const uint32_t now = static_cast<uint32_t>(esp_timer_get_time() / 1000ULL);
    s_blink_at = now + kBlinkFirstDelayMs;
    s_look_at = now + rand_span_ms(kLookMinMs, kLookSpanMs);
    s_mouth_at = now + rand_span_ms(kMouthFlipMinMs, kMouthFlipSpanMs);
    PahubUnlock();
    return s_left_ok || s_right_ok;
}

void EyesDeinit()
{
    s_left_ok = false;
    s_right_ok = false;
}

bool EyesLeftOk()
{
    return s_left_ok;
}

bool EyesRightOk()
{
    return s_right_ok;
}

bool EyesMouthSmile()
{
    return s_mouth_smile.load(std::memory_order_relaxed);
}

void EyesTick(uint32_t now_ms)
{
    if (!s_left_ok && !s_right_ok) {
        return;
    }
    bool dirty = false;
    // 口切替は I2C 不要（atomic だけ）。閉眼中は目の ∪/∩ も口に合わせるので dirty
    if (now_ms >= s_mouth_at) {
        pick_mouth();
        s_mouth_at = now_ms + rand_span_ms(kMouthFlipMinMs, kMouthFlipSpanMs);
        if (!s_eyes_open) {
            dirty = true;
        }
    }

    if (now_ms >= s_look_at && s_eyes_open) {
        pick_look();
        dirty = true;
        s_look_at = now_ms + rand_span_ms(kLookMinMs, kLookSpanMs);
    }
    if (now_ms >= s_blink_at) {
        if (s_eyes_open) {
            s_eyes_open = false;
            dirty = true;
            s_blink_at = now_ms + rand_span_ms(kBlinkClosedMinMs, kBlinkClosedSpanMs);
        } else {
            s_eyes_open = true;
            dirty = true;
            s_blink_at = now_ms + rand_span_ms(kBlinkOpenMinMs, kBlinkOpenSpanMs);
            s_look_at = now_ms + kLookAfterBlinkMs;
        }
    }
    // タイマー未発火ならバスを取らない（ToF との競合を減らす）
    if (!dirty) {
        return;
    }
    PahubLock();
    show_eyes(s_eyes_open);
    PahubUnlock();
}

}  // namespace stackchan::obake
