/*
 * Port.A 専用 I2C マスタ＋ PaHub チャネル選択。
 */
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace stackchan::obake {

bool PahubInit();
void PahubDeinit();
bool PahubOk();
/** 失敗理由の短い語（"ok" / "bus" / "probe" / "pwr" / "--"）。HUD 用 */
const char* PahubStatusTag();

/** Port.A（GPIO2 SDA）使用中。ESP-NOW レーザーとの競合防止用 */
bool PahubPortAInUse();

/** チャネル選択（0..7）。成功で true */
bool PahubSelect(uint8_t ch);

bool PahubProbe(uint8_t addr);
bool PahubWrite(uint8_t addr, const uint8_t* data, size_t len);
bool PahubWriteRead(uint8_t addr, const uint8_t* wdata, size_t wlen, uint8_t* rdata, size_t rlen);

/** バス排他（目・ToF 共有） */
void PahubLock();
void PahubUnlock();

}  // namespace stackchan::obake
