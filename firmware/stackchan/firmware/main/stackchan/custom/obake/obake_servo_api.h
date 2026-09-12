/*
 * 首サーボ（yaw/pitch）指令 API。任意スレッドから push → PreUpdate で drain。
 */
#pragma once

namespace stackchan::obake {

/** 度単位で目標角度をキュー（負の speed は既定 150） */
void ServoRequestSetHeadAngles(int yaw_deg, int pitch_deg, int speed = 150);

/** ホーム（0,0）へ */
void ServoRequestGoHome(int speed = 400);

/** 現在角を度で取得（LVGL ロック外でも可） */
void ServoGetHeadAngles(int& yaw_deg, int& pitch_deg);

/** OnStackChanPreUpdate から呼ぶ。キューを消費して Motion へ反映 */
void ServoApiDrain();

}  // namespace stackchan::obake
