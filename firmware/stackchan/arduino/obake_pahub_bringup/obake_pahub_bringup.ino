/*
 * Obake PaHub 動作確認 v0.4.11（Stack-chan / CoreS3 に一時書き込み）
 *
 * Port.A → PaHub v2.1 (0x70)
 *   CH0 左目 SSD1306 (0x3C)
 *   CH1 右目 SSD1306 (0x3C)
 *   CH2 Unit ToF U010 VL53L0X (0x29)
 *
 * CoreS3 は全面白、口だけ黒（下がくぼむ∪／上がくぼむ∩）。
 * 目は縦長の黒楕円。閉じるときは口と同じ∪か∩。きょろきょろ。
 * 足は今の位置から +720°、続けて -720°（角度のみ。秒では切らない）。画面タップで緊急停止。
 * このスケッチは Stack-chan の会話ファームを上書きする。戻し方は FLASH.md。
 */
#include <M5Unified.h>
#include <VL53L0X.h>
#include <Wire.h>
#include <string.h>

static constexpr uint8_t kPahubAddr = 0x70;
static constexpr uint8_t kOledAddr = 0x3C;
static constexpr uint8_t kOledAddrAlt = 0x3D;
static constexpr uint8_t kChLeft = 0;
static constexpr uint8_t kChRight = 1;
static constexpr uint8_t kChTof = 2;
static constexpr uint32_t kI2cHz = 400000;
// 目はモジュールを縦置き（論理 64×128）。逆さなら true にする。
static constexpr bool kOledRotateCcw = false;
// 安い 1インチは SH1106 が多く、列を 2 ずらす。真の SSD1306 で絵が切れたら 0 にする。
static constexpr uint8_t kOledColOffset = 2;

static TwoWire* gGrove = nullptr;
static VL53L0X gTof;
static bool gPahubOk = false;
static bool gLeftOk = false;
static bool gRightOk = false;
static bool gTofOk = false;
static uint8_t gLeftAddr = kOledAddr;
static uint8_t gRightAddr = kOledAddr;
static int gLastCm = -1;
static uint32_t gNextUpdateMs = 0;
static uint32_t gBlinkAt = 0;
static uint32_t gLookAt = 0;
static uint32_t gNextHudMs = 0;
static bool gEyesOpen = true;
static bool gMouthSmile = true;
static bool gMouthDrawn = false;
static int gHudCm = -2;
static int gHudDeg = -1;
// 黒目の視線オフセット（論理座標。縦長画面の中心から）
static int gLookX = 0;
static int gLookY = 0;
static constexpr uint32_t kUpdateMs = 1000;
static constexpr uint32_t kHudMs = 80;
// 液晶は最大輝度にしない（ガラスが熱い・ちらつきやすい）
static constexpr uint8_t kLcdBrightness = 48;

// 公式ファームと同じ: UART1 / TX=GPIO6 / RX=GPIO7 / 1Mbps
static constexpr int kYawUartTx = 6;
static constexpr int kYawUartRx = 7;
static constexpr uint8_t kYawId = 1;
static constexpr int kYawPwm = 700;
// エンコーダ 1024 = 360°。いまの位置から ±720° は 2 周分のステップ
static constexpr int kYawTargetDeg = 720;
static constexpr uint32_t kYawPauseMs = 600;

enum class YawPhase : uint8_t {
  WaitStart,
  Left,
  Pause,
  Right,
  Done,
  Estop,
  Fail,
};

static YawPhase gYawPhase = YawPhase::Fail;
static YawPhase gHudYaw = YawPhase::Fail;
static bool gYawOk = false;
static int gYawMinLimit = 0;
static int gYawMaxLimit = 1000;
static int gYawLastRaw = -1;
static int gYawAccumSteps = 0;
static int gYawDir = 1;
static uint32_t gYawPhaseAt = 0;
static uint32_t gYawLastMoveAt = 0;
static uint32_t gYawStartMs = 0;
static uint32_t gYawPwmAt = 0;
static bool gYawWheelOn = false;
static constexpr uint32_t kYawPwmRefreshMs = 200;
// 液晶は裏キャンバスに描いて一度に出す（途中の白塗りが見えない）
static M5Canvas gFace(&M5.Display);

static bool pahubSelect(uint8_t ch) {
  if (gGrove == nullptr) {
    return false;
  }
  gGrove->beginTransmission(kPahubAddr);
  gGrove->write(static_cast<uint8_t>(1u << ch));
  const bool ok = gGrove->endTransmission() == 0;
  delayMicroseconds(50);
  return ok;
}

static bool i2cPing(uint8_t addr) {
  gGrove->beginTransmission(addr);
  return gGrove->endTransmission() == 0;
}

static bool oledCmd(uint8_t addr, uint8_t cmd) {
  gGrove->beginTransmission(addr);
  gGrove->write(0x00);
  gGrove->write(cmd);
  return gGrove->endTransmission() == 0;
}

static bool oledInit(uint8_t addr) {
  static const uint8_t kInit[] = {
      0xAE, 0xD5, 0xF0, 0xA8, 0x3F, 0xD3, 0x00, 0x40, 0x8D, 0x14, 0x20, 0x02,
      0xA1, 0xC8, 0xDA, 0x12, 0x81, 0x5A, 0xD9, 0x22, 0xDB, 0x40, 0xA4, 0xA6,
      0xAF,
  };
  for (uint8_t c : kInit) {
    if (!oledCmd(addr, c)) {
      return false;
    }
  }
  delay(50);
  // SH1106 は 132 列ある。端の未書き込みが黒いしみになるので全面白で埋める
  uint8_t white[132];
  memset(white, 0xFF, sizeof(white));
  for (int page = 0; page < 8; ++page) {
    gGrove->beginTransmission(addr);
    gGrove->write(0x00);
    gGrove->write(static_cast<uint8_t>(0xB0 | page));
    gGrove->write(0x00);
    gGrove->write(0x10);
    gGrove->endTransmission();
    gGrove->beginTransmission(addr);
    gGrove->write(0x40);
    gGrove->write(white, 132);
    gGrove->endTransmission();
  }
  return true;
}

static void oledSendPage(uint8_t addr, const uint8_t* buf, int page) {
  // 列0から 132 バイト。両端は常に白、中央 128 が絵（SH1106 の端しみ対策）
  gGrove->beginTransmission(addr);
  gGrove->write(0x00);
  gGrove->write(static_cast<uint8_t>(0xB0 | page));
  gGrove->write(0x00);
  gGrove->write(0x10);
  gGrove->endTransmission();
  uint8_t row[132];
  memset(row, 0xFF, sizeof(row));
  memcpy(row + kOledColOffset, buf + page * 128, 128);
  gGrove->beginTransmission(addr);
  gGrove->write(0x40);
  gGrove->write(row, 132);
  gGrove->endTransmission();
}

static uint8_t findOledAddr() {
  if (i2cPing(kOledAddr)) {
    return kOledAddr;
  }
  if (i2cPing(kOledAddrAlt)) {
    return kOledAddrAlt;
  }
  for (uint8_t a = 0x08; a < 0x78; ++a) {
    if (a == kPahubAddr) {
      continue;
    }
    if (i2cPing(a)) {
      return a;
    }
  }
  return 0;
}

static void setPixel(uint8_t* buf, int x, int y, bool on) {
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

static void setPixelPortrait(uint8_t* buf, int x, int y, bool on) {
  int px;
  int py;
  if (kOledRotateCcw) {
    px = 127 - y;
    py = x;
  } else {
    px = y;
    py = 63 - x;
  }
  setPixel(buf, px, py, on);
}

// 縦置き論理座標（幅64×高さ128）に楕円を塗る。on=false が黒（消灯）
static void fillEllipsePortrait(uint8_t* buf, int cx, int cy, int rx, int ry,
                                bool on) {
  if (rx <= 0 || ry <= 0) {
    return;
  }
  const long rx2 = static_cast<long>(rx) * rx;
  const long ry2 = static_cast<long>(ry) * ry;
  const long r2 = rx2 * ry2;
  for (int y = -ry; y <= ry; ++y) {
    const long yy = static_cast<long>(y) * y * rx2;
    for (int x = -rx; x <= rx; ++x) {
      const long xx = static_cast<long>(x) * x * ry2;
      if (xx + yy <= r2) {
        setPixelPortrait(buf, cx + x, cy + y, on);
      }
    }
  }
}

// 開: 白地に縦長の黒楕円。閉: 口と同じ（下がくぼむ∪／上がくぼむ∩）
static void renderEye(uint8_t* buf, bool open, int lookX, int lookY) {
  memset(buf, 0xFF, 1024);
  if (open) {
    fillEllipsePortrait(buf, 32 + lookX, 64 + lookY, 16, 40, false);
  } else {
    const int cx = 32;
    const int cy = 96;
    if (gMouthSmile) {
      fillEllipsePortrait(buf, cx, cy + 8, 22, 16, false);
      fillEllipsePortrait(buf, cx, cy - 14, 26, 18, true);
    } else {
      fillEllipsePortrait(buf, cx, cy - 8, 22, 16, false);
      fillEllipsePortrait(buf, cx, cy + 14, 26, 18, true);
    }
  }
}

static void showEyes(bool open) {
  uint8_t leftBuf[1024];
  uint8_t rightBuf[1024];
  if (gLeftOk) {
    renderEye(leftBuf, open, gLookX, gLookY);
  }
  if (gRightOk) {
    renderEye(rightBuf, open, gLookX, gLookY);
  }
  // PaHub は同時書き込み不可。ページごとに左右連続で送り、CH1 だけ遅れるのを抑える
  for (int page = 0; page < 8; ++page) {
    if (gLeftOk && pahubSelect(kChLeft)) {
      oledSendPage(gLeftAddr, leftBuf, page);
    }
    if (gRightOk && pahubSelect(kChRight)) {
      oledSendPage(gRightAddr, rightBuf, page);
    }
  }
}

// きょろきょろ用の次の視線。黒楕円が画面内に収まる範囲
static void pickLook() {
  gLookX = static_cast<int>(esp_random() % 15) - 7;
  gLookY = static_cast<int>(esp_random() % 21) - 10;
}

// 口もきょろきょろと同じ間隔で笑い／起きを切り替える
static void pickMouth() {
  gMouthSmile = (esp_random() & 1) != 0;
}

static void scsFlushRx() {
  while (Serial1.available()) {
    Serial1.read();
  }
}

static uint8_t scsSum(uint8_t id, uint8_t len, uint8_t inst, const uint8_t* p,
                      uint8_t n) {
  uint8_t s = static_cast<uint8_t>(id + len + inst);
  for (uint8_t i = 0; i < n; ++i) {
    s = static_cast<uint8_t>(s + p[i]);
  }
  return static_cast<uint8_t>(~s);
}

// 飛特パケット送信。params は INST の直後（WRITE/READ なら Addr+データ）
static void scsTx(uint8_t id, uint8_t inst, const uint8_t* params, uint8_t n) {
  const uint8_t len = static_cast<uint8_t>(n + 2);
  uint8_t hdr[5] = {0xFF, 0xFF, id, len, inst};
  scsFlushRx();
  Serial1.write(hdr, 5);
  if (n && params) {
    Serial1.write(params, n);
  }
  Serial1.write(scsSum(id, len, inst, params, n));
  Serial1.flush();
}

static int scsRxPacket(uint8_t id, uint8_t* data, int maxData, uint32_t timeoutMs) {
  uint8_t buf[24];
  int got = 0;
  const uint32_t t0 = millis();
  while (got < 24 && millis() - t0 < timeoutMs) {
    if (Serial1.available()) {
      buf[got++] = static_cast<uint8_t>(Serial1.read());
    }
  }
  for (int i = 0; i + 5 < got; ++i) {
    if (buf[i] != 0xFF || buf[i + 1] != 0xFF) {
      continue;
    }
    if (buf[i + 2] != id) {
      continue;
    }
    const int plen = buf[i + 3];
    const int dataN = plen - 2;
    if (dataN < 0 || i + 4 + plen > got) {
      continue;
    }
    const int n = (dataN < maxData) ? dataN : maxData;
    if (data && n > 0) {
      memcpy(data, &buf[i + 5], n);
    }
    return n;
  }
  return -1;
}

static bool scsPing(uint8_t id) {
  scsTx(id, 0x01, nullptr, 0);
  return scsRxPacket(id, nullptr, 0, 30) >= 0;
}

static bool scsWriteMem(uint8_t id, uint8_t addr, const uint8_t* data, uint8_t n) {
  uint8_t p[8];
  p[0] = addr;
  memcpy(p + 1, data, n);
  scsTx(id, 0x03, p, static_cast<uint8_t>(n + 1));
  return scsRxPacket(id, nullptr, 0, 20) >= 0;
}

static int scsReadWord(uint8_t id, uint8_t addr) {
  uint8_t p[2] = {addr, 2};
  scsTx(id, 0x02, p, 2);
  uint8_t d[4] = {0};
  if (scsRxPacket(id, d, 3, 30) < 2) {
    return -1;
  }
  // End=1: 先頭が高位
  return (static_cast<int>(d[0]) << 8) | d[1];
}

static bool scsWriteWord(uint8_t id, uint8_t addr, uint16_t v) {
  uint8_t d[2] = {static_cast<uint8_t>(v >> 8), static_cast<uint8_t>(v & 0xFF)};
  return scsWriteMem(id, addr, d, 2);
}

static bool scsWriteByte(uint8_t id, uint8_t addr, uint8_t v) {
  return scsWriteMem(id, addr, &v, 1);
}

static bool yawSetPwm(int pwm) {
  // GOAL_TIME に PWM。負は bit10 で方向
  int v = pwm;
  if (v < 0) {
    v = -v;
    v |= (1 << 10);
  }
  return scsWriteWord(kYawId, 44, static_cast<uint16_t>(v));
}

static bool yawEnterWheel() {
  gYawMinLimit = scsReadWord(kYawId, 9);
  gYawMaxLimit = scsReadWord(kYawId, 11);
  if (gYawMinLimit < 0) {
    gYawMinLimit = 0;
  }
  if (gYawMaxLimit < 0) {
    gYawMaxLimit = 1000;
  }
  uint8_t z[4] = {0, 0, 0, 0};
  const bool ok = scsWriteMem(kYawId, 9, z, 4);
  gYawWheelOn = ok;
  return ok;
}

static void yawLeaveWheel() {
  yawSetPwm(0);
  scsWriteWord(kYawId, 9, static_cast<uint16_t>(gYawMinLimit));
  scsWriteWord(kYawId, 11, static_cast<uint16_t>(gYawMaxLimit));
  scsWriteByte(kYawId, 40, 1);
  gYawWheelOn = false;
}

static int yawReadRaw() {
  int p = scsReadWord(kYawId, 56);
  if (p < 0) {
    return -1;
  }
  if (p > 1023) {
    p = ((p & 0xFF) << 8) | ((p >> 8) & 0xFF);
  }
  return p & 0x03FF;
}

static void yawStartLeg(int dir, YawPhase phase) {
  gYawDir = dir;
  gYawPhase = phase;
  gYawAccumSteps = 0;
  gYawLastRaw = yawReadRaw();
  gYawLastMoveAt = millis();
  gYawStartMs = millis();
  gYawPwmAt = millis();
  // 回転モードは一度だけ。毎回 EEPROM の可動範囲を書き直すと途中で弱くなる
  if (!gYawWheelOn) {
    yawEnterWheel();
  }
  yawSetPwm(dir * kYawPwm);
  Serial.printf("YAW_START dir=%d\n", dir);
}

static void yawEmergencyStop() {
  if (gYawPhase == YawPhase::Estop || gYawPhase == YawPhase::Fail ||
      gYawPhase == YawPhase::Done) {
    yawSetPwm(0);
    return;
  }
  yawLeaveWheel();
  gYawPhase = YawPhase::Estop;
  Serial.println("YAW_ESTOP tap");
}

static int yawDegFromSteps() {
  return gYawAccumSteps * 360 / 1024;
}

// 秒数では止めない。指令方向に 720° 積んだら終わり
static bool yawTurnFinished() {
  return yawDegFromSteps() >= kYawTargetDeg;
}

static void yawTick() {
  if (!gYawOk) {
    return;
  }
  const uint32_t now = millis();
  if (gYawPhase == YawPhase::WaitStart) {
    if (now >= gYawPhaseAt) {
      yawStartLeg(1, YawPhase::Left);
    }
    return;
  }
  if (gYawPhase == YawPhase::Pause) {
    if (now >= gYawPhaseAt) {
      yawStartLeg(-1, YawPhase::Right);
    }
    return;
  }
  if (gYawPhase != YawPhase::Left && gYawPhase != YawPhase::Right) {
    return;
  }

  // 飛特の PWM は送り続けないと速度が落ちて止まることがある（筐体干渉ではない）
  if (now - gYawPwmAt >= kYawPwmRefreshMs) {
    gYawPwmAt = now;
    yawSetPwm(gYawDir * kYawPwm);
  }

  const int raw = yawReadRaw();
  if (raw >= 0 && gYawLastRaw >= 0) {
    int d = raw - gYawLastRaw;
    if (d > 512) {
      d -= 1024;
    } else if (d < -512) {
      d += 1024;
    }
    if (d != 0) {
      // 指令方向（+720 / -720）の分だけ積む
      const int along = (gYawDir > 0) ? d : -d;
      if (along > 0) {
        gYawAccumSteps += along;
      }
      gYawLastMoveAt = now;
      gYawLastRaw = raw;
    }
  } else if (raw >= 0) {
    gYawLastRaw = raw;
  }

  const int deg = yawDegFromSteps();
  if ((now - gYawStartMs) % 500 < 20) {
    Serial.printf("YAW_DEG=%d steps=%d\n", deg, gYawAccumSteps);
  }

  if (yawTurnFinished()) {
    yawSetPwm(0);
    Serial.printf("YAW_DONE_LEG deg=%d steps=%d\n", deg, gYawAccumSteps);
    if (gYawPhase == YawPhase::Left) {
      gYawPhase = YawPhase::Pause;
      gYawPhaseAt = now + kYawPauseMs;
    } else {
      yawLeaveWheel();
      gYawPhase = YawPhase::Done;
      Serial.println("YAW_DONE here+720+720");
    }
  }
}

static TwoWire* takeGroveBus() {
  const int sda = M5.Ex_I2C.getSDA();
  const int scl = M5.Ex_I2C.getSCL();
  const i2c_port_t port = M5.Ex_I2C.getPort();
  M5.Ex_I2C.release();
  TwoWire* bus = (port == I2C_NUM_0) ? &Wire : &Wire1;
  bus->begin(sda, scl, kI2cHz);
  bus->setBufferSize(256);
  return bus;
}

// 口・HUD をキャンバスにまとめてから1回だけ液晶へ出す
static void presentFace() {
  auto& d = gFace;
  const int w = d.width();
  const int h = d.height();
  d.fillSprite(TFT_WHITE);

  const int cx = w / 2;
  const int cy = h / 2 + 16;
  const int rx = 70;
  const int ry = 36;
  if (gMouthSmile) {
    d.fillEllipse(cx, cy + 12, rx, ry, TFT_BLACK);
    d.fillEllipse(cx, cy - 10, rx + 6, ry, TFT_WHITE);
  } else {
    d.fillEllipse(cx, cy - 12, rx, ry, TFT_BLACK);
    d.fillEllipse(cx, cy + 10, rx + 6, ry, TFT_WHITE);
  }

  d.setTextColor(TFT_DARKGREY, TFT_WHITE);
  d.setTextSize(1);
  d.setCursor(6, 6);
  d.print("Obake  v0.4.11");
  d.setCursor(6, 18);
  d.printf("P%s T%s L%s R%s Y%s", gPahubOk ? "ok" : "--", gTofOk ? "ok" : "--",
           gLeftOk ? "ok" : "--", gRightOk ? "ok" : "--",
           gYawOk ? "ok" : "--");
  d.setCursor(w - 72, 6);
  d.setTextColor(TFT_BLACK, TFT_WHITE);
  if (gLastCm >= 0) {
    d.printf("%3d cm", gLastCm);
  } else {
    d.setTextColor(TFT_DARKGREY, TFT_WHITE);
    d.print("-- cm");
  }

  const int deg = yawDegFromSteps();
  if (gYawPhase == YawPhase::Left || gYawPhase == YawPhase::Right ||
      gYawPhase == YawPhase::WaitStart || gYawPhase == YawPhase::Pause) {
    d.setTextColor(TFT_RED, TFT_WHITE);
    d.setCursor(6, 32);
    d.print("TAP = STOP");
    d.setTextColor(TFT_BLACK, TFT_WHITE);
    d.setCursor(6, 46);
    if (gYawPhase == YawPhase::Left) {
      d.printf("+720  %3d", deg);
    } else if (gYawPhase == YawPhase::Right) {
      d.printf("-720  %3d", deg);
    } else if (gYawPhase == YawPhase::Pause) {
      d.print("then -720");
    } else {
      d.print("from here +720");
    }
  } else if (gYawPhase == YawPhase::Estop) {
    d.setTextColor(TFT_RED, TFT_WHITE);
    d.setCursor(6, 32);
    d.printf("ESTOP  %d deg", deg);
  } else if (gYawPhase == YawPhase::Done) {
    d.setTextColor(TFT_DARKGREEN, TFT_WHITE);
    d.setCursor(6, 32);
    d.print("YAW +720 -720 OK");
  } else if (gYawPhase == YawPhase::Fail) {
    d.setTextColor(TFT_ORANGE, TFT_WHITE);
    d.setCursor(6, 32);
    d.print("YAW fail");
  }

  d.setTextColor(TFT_DARKGREY, TFT_WHITE);
  d.setCursor(6, h - 14);
  if (gLastCm >= 0) {
    d.printf("ALT_CM=%d", gLastCm);
  } else {
    d.print("ALT_CM=----");
  }

  d.pushSprite(0, 0);
  gMouthDrawn = true;
  gHudCm = gLastCm;
  gHudYaw = gYawPhase;
  gHudDeg = deg;
}

static void drawMouth() {
  presentFace();
}

static void drawHud() {
  presentFace();
}

static void drawCoreUi(bool forceMouth) {
  (void)forceMouth;
  presentFace();
}

void setup() {
  auto cfg = M5.config();
  cfg.external_display_value = 0;
  cfg.output_power = true;
  M5.begin(cfg);
  Serial.begin(115200);
  // デフォルトはバックライト最大寄りでガラスが熱くなる。確認用は抑える（0–255）
  M5.Display.setBrightness(kLcdBrightness);
  gFace.setPsram(true);
  gFace.setColorDepth(16);
  gFace.createSprite(M5.Display.width(), M5.Display.height());

  M5.Display.fillScreen(TFT_WHITE);
  M5.Display.setTextColor(TFT_BLACK, TFT_WHITE);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(8, 8);
  M5.Display.print("Obake bringup");

  gGrove = takeGroveBus();
  delay(50);

  // 水平サーボは PaHub と独立（公式: UART1 GPIO6/7）
  Serial1.begin(1000000, SERIAL_8N1, kYawUartRx, kYawUartTx);
  delay(20);
  gYawOk = scsPing(kYawId);
  Serial.printf("YAW ping=%d\n", gYawOk);
  if (gYawOk) {
    scsWriteByte(kYawId, 40, 1);
    gYawPhase = YawPhase::WaitStart;
    gYawPhaseAt = millis() + 400;
  } else {
    gYawPhase = YawPhase::Fail;
  }

  gPahubOk = i2cPing(kPahubAddr);
  if (!gPahubOk) {
    drawCoreUi(true);
    return;
  }

  if (pahubSelect(kChLeft)) {
    gLeftAddr = findOledAddr();
    gLeftOk = (gLeftAddr != 0) && oledInit(gLeftAddr);
    Serial.printf("CH0 oled addr=0x%02X init=%d\n", gLeftAddr, gLeftOk);
  }

  if (pahubSelect(kChRight)) {
    gRightAddr = findOledAddr();
    gRightOk = (gRightAddr != 0) && oledInit(gRightAddr);
    Serial.printf("CH1 oled addr=0x%02X init=%d\n", gRightAddr, gRightOk);
  }

  pickLook();
  pickMouth();
  showEyes(true);

  pahubSelect(kChTof);
  gTof.setBus(gGrove);
  gTof.setTimeout(500);
  gTofOk = gTof.init();
  if (gTofOk) {
    // Long Range: 公称 200 cm（室内は暗いほど届きやすい）
    gTof.setSignalRateLimit(0.1);
    gTof.setVcselPulsePeriod(VL53L0X::VcselPeriodPreRange, 18);
    gTof.setVcselPulsePeriod(VL53L0X::VcselPeriodFinalRange, 14);
    gTof.setMeasurementTimingBudget(200000);
    gTof.startContinuous(250);
  }

  gBlinkAt = millis() + 2500;
  gLookAt = millis() + 800;
  gNextUpdateMs = 0;
  gNextHudMs = 0;
  drawCoreUi(true);
}

void loop() {
  M5.update();
  const uint32_t now = millis();

  // 回転中は画面どこでも緊急停止（口や距離より優先）
  if (M5.Touch.getCount() > 0) {
    const auto t = M5.Touch.getDetail(0);
    if (t.wasPressed() || t.wasClicked()) {
      yawEmergencyStop();
    }
  }

  yawTick();

  if (now >= gNextUpdateMs) {
    gNextUpdateMs = now + kUpdateMs;
    if (gPahubOk && gTofOk && pahubSelect(kChTof)) {
      const uint16_t mm = gTof.readRangeContinuousMillimeters();
      if (gTof.timeoutOccurred() || mm > 2000) {
        gLastCm = -1;
        Serial.println("ALT_CM=----");
      } else {
        gLastCm = static_cast<int>((mm + 5) / 10);
        Serial.printf("ALT_CM=%d\n", gLastCm);
      }
    }
  }

  // HUD だけ更新。口と OLED は状態が変わったときだけ描く（点滅防止）
  if (now >= gNextHudMs) {
    gNextHudMs = now + kHudMs;
    const int deg = yawDegFromSteps();
    if (gLastCm != gHudCm || gYawPhase != gHudYaw || deg != gHudDeg) {
      drawHud();
    }
  }

  if (now >= gLookAt) {
    pickMouth();
    drawMouth();
    if ((gLeftOk || gRightOk) && gEyesOpen) {
      pickLook();
      showEyes(true);
    }
    gLookAt = now + 400 + (esp_random() % 1400);
  }

  if ((gLeftOk || gRightOk) && now >= gBlinkAt) {
    gEyesOpen = !gEyesOpen;
    showEyes(gEyesOpen);
    if (gEyesOpen) {
      gBlinkAt = now + 1800 + (esp_random() % 2200);
      gLookAt = now + 200;
    } else {
      gBlinkAt = now + 90 + (esp_random() % 80);
    }
  }

  delay(10);
}
