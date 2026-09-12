/*
 * Obake ハンド（首 yaw）角度チューニング
 *
 * 本番 hand.set と同じ軸: Stack-chan 水平サーボ ID=1（UART1 TX=6 RX=7 / 1Mbps）
 * 画面とシリアルに「目標度・フィードバック度・raw」を出し、開く／閉じる候補を数値で決める。
 *
 * 使い方（画面タップ）:
 *   -10 / -5 / -1 / 0 / +1 / +5 / +10 … 目標度を変えて即移動
 *   SET OPEN / SET CLOSE … いまの目標度を候補として記録
 *   GO OPEN / GO CLOSE … 記録した候補へ移動
 *
 * 決まったら本番 obake_config.h の kHandOpenYawDeg / kHandCloseYawDeg に同じ数値を書く。
 * このスケッチは会話ファームを上書きする。戻し方は FLASH.md。
 */
#include <M5Unified.h>
#include <string.h>

// 公式ファーム（hal_servo）と同じ配線・ゼロ位置
static constexpr int kUartTx = 6;
static constexpr int kUartRx = 7;
static constexpr uint8_t kYawId = 1;
static constexpr int kZeroPos = 460;       // defaultZeroPos
static constexpr int kRawMin = 0;
static constexpr int kRawMax = 1000;
static constexpr int kDegLimit = 128;      // 本番 clamp と同程度（±128°）
static constexpr uint16_t kMoveTime = 200; // WritePos の時間（大きいほどゆっくり）

static int gTargetDeg = 0;
static int gOpenCand = 45;   // 初期は現行 config の目安
static int gCloseCand = 0;
static int gFbDeg = 0;
static int gRaw = -1;
static bool gServoOk = false;
static uint32_t gNextHudMs = 0;
static uint32_t gNextFbMs = 0;

struct Btn {
  int x, y, w, h;
  const char* label;
};

// 上段: 角度操作 / 下段: 候補の記録と再生
static const Btn kBtns[] = {
    {8, 118, 56, 36, "-10"},   {70, 118, 56, 36, "-5"},  {132, 118, 56, 36, "-1"},
    {194, 118, 56, 36, "0"},   {256, 118, 56, 36, "+1"},
    {8, 160, 56, 36, "+5"},    {70, 160, 56, 36, "+10"},
    {140, 160, 84, 36, "SET OP"}, {232, 160, 80, 36, "SET CL"},
    {8, 202, 148, 34, "GO OPEN"}, {164, 202, 148, 34, "GO CLOSE"},
};
static constexpr int kBtnN = sizeof(kBtns) / sizeof(kBtns[0]);

static void scsFlushRx() {
  while (Serial1.available()) {
    Serial1.read();
  }
}

static uint8_t scsSum(uint8_t id, uint8_t len, uint8_t inst, const uint8_t* p, uint8_t n) {
  uint8_t s = static_cast<uint8_t>(id + len + inst);
  for (uint8_t i = 0; i < n; ++i) {
    s = static_cast<uint8_t>(s + p[i]);
  }
  return static_cast<uint8_t>(~s);
}

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
  uint8_t buf[32];
  int got = 0;
  const uint32_t t0 = millis();
  while (got < 32 && millis() - t0 < timeoutMs) {
    if (Serial1.available()) {
      buf[got++] = static_cast<uint8_t>(Serial1.read());
    }
  }
  for (int i = 0; i + 5 < got; ++i) {
    if (buf[i] != 0xFF || buf[i + 1] != 0xFF || buf[i + 2] != id) {
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
  return scsRxPacket(id, nullptr, 0, 40) >= 0;
}

static bool scsWriteMem(uint8_t id, uint8_t addr, const uint8_t* data, uint8_t n) {
  uint8_t p[12];
  p[0] = addr;
  memcpy(p + 1, data, n);
  scsTx(id, 0x03, p, static_cast<uint8_t>(n + 1));
  return scsRxPacket(id, nullptr, 0, 30) >= 0;
}

static int scsReadWord(uint8_t id, uint8_t addr) {
  uint8_t p[2] = {addr, 2};
  scsTx(id, 0x02, p, 2);
  uint8_t d[4] = {0};
  if (scsRxPacket(id, d, 3, 40) < 2) {
    return -1;
  }
  // End=1: 先頭が高位（公式 SCSCL と同じ）
  return (static_cast<int>(d[0]) << 8) | d[1];
}

static bool scsWriteByte(uint8_t id, uint8_t addr, uint8_t v) {
  return scsWriteMem(id, addr, &v, 1);
}

static bool scsWriteWord(uint8_t id, uint8_t addr, uint16_t v) {
  uint8_t d[2] = {static_cast<uint8_t>(v >> 8), static_cast<uint8_t>(v & 0xFF)};
  return scsWriteMem(id, addr, d, 2);
}

/** 度 → 生ポジション（hal_servo ScsServo と同じ式） */
static int degToRaw(int deg) {
  // mapped = zero + (deg*10) * 16 / 5 / 10 = zero + deg * 16 / 5
  int raw = kZeroPos + (deg * 16) / 5;
  if (raw < kRawMin) {
    raw = kRawMin;
  }
  if (raw > kRawMax) {
    raw = kRawMax;
  }
  return raw;
}

/** 生ポジション → 度（整数。フィードバック表示用） */
static int rawToDeg(int raw) {
  // angle_0.1deg = (raw - zero) * 5 * 10 / 16 → deg = その / 10
  return (raw - kZeroPos) * 5 / 16;
}

static int clampDeg(int deg) {
  if (deg < -kDegLimit) {
    return -kDegLimit;
  }
  if (deg > kDegLimit) {
    return kDegLimit;
  }
  return deg;
}

/** 位置モードへ戻してトルク ON（wheel 確認スケッチ後でも使えるようリミット復帰） */
static bool yawEnsurePositionMode() {
  // PWM/wheel は角度リミットを潰すので、位置モード用に 0..1000 を書き戻す
  scsWriteWord(kYawId, 9, static_cast<uint16_t>(kRawMin));
  scsWriteWord(kYawId, 11, static_cast<uint16_t>(kRawMax));
  delay(20);
  return scsWriteByte(kYawId, 40, 1);  // TORQUE_ENABLE
}

/** 目標度へ移動（WritePos 相当: Pos + Time + Speed） */
static bool yawGoDeg(int deg) {
  deg = clampDeg(deg);
  gTargetDeg = deg;
  const int raw = degToRaw(deg);
  uint8_t d[6] = {
      static_cast<uint8_t>(raw >> 8),
      static_cast<uint8_t>(raw & 0xFF),
      static_cast<uint8_t>(kMoveTime >> 8),
      static_cast<uint8_t>(kMoveTime & 0xFF),
      0,
      0,
  };
  // GOAL_POSITION_L = 42 から Pos(2)+Time(2)+Speed(2)
  const bool ok = scsWriteMem(kYawId, 42, d, 6);
  Serial.printf("MOVE target_deg=%d raw=%d ok=%d | open_cand=%d close_cand=%d\n", deg, raw, ok ? 1 : 0,
                gOpenCand, gCloseCand);
  return ok;
}

static void yawReadFb() {
  int raw = scsReadWord(kYawId, 56);  // PRESENT_POSITION
  if (raw < 0) {
    return;
  }
  // エンディアンずれ対策（bringup と同じ）
  if (raw > 1023) {
    raw = ((raw & 0xFF) << 8) | ((raw >> 8) & 0xFF);
  }
  raw = raw & 0x03FF;
  gRaw = raw;
  gFbDeg = rawToDeg(raw);
}

static void drawBtn(const Btn& b, uint16_t fill) {
  M5.Display.fillRoundRect(b.x, b.y, b.w, b.h, 6, fill);
  M5.Display.drawRoundRect(b.x, b.y, b.w, b.h, 6, TFT_WHITE);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setTextColor(TFT_WHITE);
  M5.Display.setTextSize(1);
  M5.Display.drawString(b.label, b.x + b.w / 2, b.y + b.h / 2);
}

static void drawHud(bool force) {
  const uint32_t now = millis();
  if (!force && now < gNextHudMs) {
    return;
  }
  gNextHudMs = now + 100;

  M5.Display.fillRect(0, 0, 320, 112, TFT_BLACK);
  M5.Display.setTextDatum(top_left);
  M5.Display.setTextColor(TFT_CYAN);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(8, 6);
  M5.Display.print("HAND YAW TUNE");

  M5.Display.setTextColor(TFT_WHITE);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(8, 32);
  M5.Display.printf("target %+4d deg", gTargetDeg);
  M5.Display.setCursor(8, 54);
  M5.Display.printf("fb     %+4d deg", gFbDeg);
  M5.Display.setCursor(8, 76);
  M5.Display.printf("raw    %4d  z=%d", gRaw, kZeroPos);

  M5.Display.setTextSize(1);
  M5.Display.setTextColor(TFT_YELLOW);
  M5.Display.setCursor(8, 98);
  M5.Display.printf("OPEN cand=%+d   CLOSE cand=%+d   servo=%s", gOpenCand, gCloseCand,
                    gServoOk ? "OK" : "NG");

  for (int i = 0; i < kBtnN; ++i) {
    drawBtn(kBtns[i], TFT_DARKGREY);
  }
}

static void printCandidates() {
  Serial.println("--- candidates for obake_config.h ---");
  Serial.printf("kHandOpenYawDeg  = %d;\n", gOpenCand);
  Serial.printf("kHandCloseYawDeg = %d;\n", gCloseCand);
  Serial.printf("now target=%d fb=%d raw=%d\n", gTargetDeg, gFbDeg, gRaw);
}

static void handleTap(int x, int y) {
  for (int i = 0; i < kBtnN; ++i) {
    const Btn& b = kBtns[i];
    if (x < b.x || y < b.y || x >= b.x + b.w || y >= b.y + b.h) {
      continue;
    }
    if (strcmp(b.label, "-10") == 0) {
      yawGoDeg(gTargetDeg - 10);
    } else if (strcmp(b.label, "-5") == 0) {
      yawGoDeg(gTargetDeg - 5);
    } else if (strcmp(b.label, "-1") == 0) {
      yawGoDeg(gTargetDeg - 1);
    } else if (strcmp(b.label, "0") == 0) {
      yawGoDeg(0);
    } else if (strcmp(b.label, "+1") == 0) {
      yawGoDeg(gTargetDeg + 1);
    } else if (strcmp(b.label, "+5") == 0) {
      yawGoDeg(gTargetDeg + 5);
    } else if (strcmp(b.label, "+10") == 0) {
      yawGoDeg(gTargetDeg + 10);
    } else if (strcmp(b.label, "SET OP") == 0) {
      gOpenCand = gTargetDeg;
      printCandidates();
    } else if (strcmp(b.label, "SET CL") == 0) {
      gCloseCand = gTargetDeg;
      printCandidates();
    } else if (strcmp(b.label, "GO OPEN") == 0) {
      yawGoDeg(gOpenCand);
    } else if (strcmp(b.label, "GO CLOSE") == 0) {
      yawGoDeg(gCloseCand);
    }
    drawHud(true);
    return;
  }
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setBrightness(48);
  M5.Display.fillScreen(TFT_BLACK);
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("obake_hand_yaw_tune: hand = yaw degrees for kHandOpen/CloseYawDeg");

  Serial1.begin(1000000, SERIAL_8N1, kUartRx, kUartTx);
  delay(50);
  gServoOk = scsPing(kYawId);
  if (gServoOk) {
    yawEnsurePositionMode();
    yawReadFb();
    gTargetDeg = clampDeg(gFbDeg);
    yawGoDeg(gTargetDeg);
  } else {
    Serial.println("ERROR: yaw servo ID=1 ping failed (UART GPIO6/7)");
  }
  drawHud(true);
  printCandidates();
}

void loop() {
  M5.update();
  if (M5.Touch.getCount() > 0) {
    const auto t = M5.Touch.getDetail(0);
    if (t.wasPressed()) {
      handleTap(t.x, t.y);
    }
  }

  const uint32_t now = millis();
  if (gServoOk && now >= gNextFbMs) {
    gNextFbMs = now + 120;
    yawReadFb();
    drawHud(false);
  }
}
