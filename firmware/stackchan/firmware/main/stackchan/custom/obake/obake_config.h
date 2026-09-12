/*
 * Obake 定数。先頭の「人が変える値」だけ触れば顔の見え方を調整できる。
 * 手順: 同フォルダ README.md「調整手順」を参照。
 */
#pragma once

#include <driver/gpio.h>
#include <stdint.h>

namespace stackchan::obake {

// =============================================================================
// 人が変える値（まばたき・きょろきょろ・明るさ・周期）
// ビルドし直して CUSTOM で確認。ハード配線はこのブロックの下。
// =============================================================================

/** OLED 明るさ（SH1106/SSD1306 contrast 0x81。0=暗〜255=明。既定 0x5A） */
inline constexpr uint8_t kOledContrast = 0x5A;

/** 開眼のまま待つ時間 = Min + rand%(Span+1) ms */
inline constexpr uint32_t kBlinkOpenMinMs = 1800;
inline constexpr uint32_t kBlinkOpenSpanMs = 2200;
/** 閉眼の長さ = Min + rand%(Span+1) ms */
inline constexpr uint32_t kBlinkClosedMinMs = 90;
inline constexpr uint32_t kBlinkClosedSpanMs = 80;
/** 起動後、初回まばたきまでの待ち */
inline constexpr uint32_t kBlinkFirstDelayMs = 2500;

/** きょろきょろ間隔 = Min + rand%(Span+1) ms（開眼中のみ） */
inline constexpr uint32_t kLookMinMs = 400;
inline constexpr uint32_t kLookSpanMs = 1400;
/** 開眼直後に次の視線を前倒しするオフセット */
inline constexpr uint32_t kLookAfterBlinkMs = 200;
/** 視線オフセット幅（中心±）。X は 0..2*Range、Y も同様 */
inline constexpr int kLookRangeX = 7;
inline constexpr int kLookRangeY = 10;

/** 口 ∪/∩ 切替間隔（視線と独立。長くすると口の再描画が減る） */
inline constexpr uint32_t kMouthFlipMinMs = 3000;
inline constexpr uint32_t kMouthFlipSpanMs = 4000;

/** PaHub 目・ToF を回す hw タスク周期 */
inline constexpr uint32_t kHwTickMs = 40;
/** ToF 表示更新周期 */
inline constexpr uint32_t kTofUpdateMs = 1000;
/** 口 UI: 標準顔・吹き出しを隠し直す保険間隔（毎フレームはやらない） */
inline constexpr uint32_t kMouthHideRetryMs = 500;

// =============================================================================
// デバッグ用スイッチ（数値だけ変える）
// =============================================================================

/**
 * 起動後に CUSTOM を自動オープンするか。
 * 0 = 手動（ランチャーでタップ）
 * 1 = 自動（エージェント検証向け。既定 ON）
 */
inline constexpr int kObakeAutoCustom = 1;

// =============================================================================
// Media WebSocket（端末=クライアント → PC/homelab サーバ）
// Windows hosts は PC ブラウザ専用。ESP は下記 LAN マップ（または LAN DNS）で解決する。
// =============================================================================

/** ログ・URL 表示用ホスト名（接続先の論理名） */
inline constexpr const char* kMediaWsHost = "obake.media.stackchan";
/**
 * ESP 用 A レコード相当（ファーム内蔵マップ）。
 * 空 "" なら OS DNS のみ。ルータ DNS が無い検証では PC の Wi-Fi IPv4 を入れる。
 * PC の IP が変わったらここと hosts / dns_responder を更新する。
 */
inline constexpr const char* kMediaWsLanIp = "172.16.0.66";
/** サーバ待ち受けポート（homelab/obake_media/server.py と一致） */
inline constexpr int kMediaWsPort = 8030;
/** WebSocket パス */
inline constexpr const char* kMediaWsPath = "/obake/media";

/** JPEG 品質・送信間隔 */
inline constexpr int kMediaJpegQuality = 20;
inline constexpr uint32_t kMediaJpegIntervalMs = 400;
/** PCM 送信間隔（マイクは Xiaozhi と共有のため JPEG より疎でよい） */
inline constexpr uint32_t kMediaPcmIntervalMs = 200;
/** この時間 JPEG 送信成功が無いと WS 再接続（カメラ待ち固まり対策） */
inline constexpr uint32_t kMediaJpegStallMs = 8000;
/** 再接続間隔 */
inline constexpr uint32_t kMediaReconnectMs = 5000;

// =============================================================================
// ハード定数（配線・アドレス。普段は触らない）
// =============================================================================

/** Port.A Grove: SDA=G2 / SCL=G1（内部バス GPIO11/12 とは別） */
inline constexpr gpio_num_t kPortASda = GPIO_NUM_2;
inline constexpr gpio_num_t kPortAScl = GPIO_NUM_1;
inline constexpr uint32_t kI2cHz = 400000;
/** 内部 I2C が port 1 なので Port.A は 0 */
inline constexpr int kPortAI2cPort = 0;

inline constexpr uint8_t kPahubAddr = 0x70;
inline constexpr uint8_t kChLeft = 0;
inline constexpr uint8_t kChRight = 1;
inline constexpr uint8_t kChTof = 2;

inline constexpr uint8_t kOledAddr = 0x3C;
inline constexpr uint8_t kOledAddrAlt = 0x3D;
inline constexpr uint8_t kOledColOffset = 2;
inline constexpr bool kOledRotateCcw = false;

inline constexpr uint8_t kTofAddr = 0x29;
inline constexpr uint16_t kTofMaxMm = 2000;

inline constexpr const char* kObakeUiLabel = "Obake face";

}  // namespace stackchan::obake
