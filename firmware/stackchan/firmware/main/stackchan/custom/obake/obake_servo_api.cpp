/*
 * 首サーボ指令キュー。CUSTOM 会話中でもサーバ下行を安全に適用する。
 */
#include "obake_servo_api.h"

#include <algorithm>
#include <deque>
#include <mutex>

#include <esp_log.h>
#include <stackchan/custom/custom_integration.h>
#include <stackchan/stackchan.h>

namespace stackchan::obake {
namespace {

const char* TAG = "obake_servo";

/** Motion 内部は 0.1° 単位 */
constexpr int kDegToInternal = 10;
constexpr int kYawMinDeg = -128;
constexpr int kYawMaxDeg = 128;
constexpr int kPitchMinDeg = 0;
constexpr int kPitchMaxDeg = 90;
constexpr int kDefaultSpeed = 150;

enum class CmdType : uint8_t {
    SetAngles,
    GoHome,
};

struct Cmd {
    CmdType type = CmdType::SetAngles;
    int yaw_deg = 0;
    int pitch_deg = 0;
    int speed = kDefaultSpeed;
};

std::mutex s_mu;
std::deque<Cmd> s_queue;

int clamp_yaw(int deg)
{
    return std::clamp(deg, kYawMinDeg, kYawMaxDeg);
}

int clamp_pitch(int deg)
{
    return std::clamp(deg, kPitchMinDeg, kPitchMaxDeg);
}

int clamp_speed(int speed)
{
    if (speed < 100) {
        return 100;
    }
    if (speed > 1000) {
        return 1000;
    }
    return speed;
}

void push_cmd(Cmd cmd)
{
    std::lock_guard<std::mutex> lock(s_mu);
    // 古い角度指令は捨てて最新だけ残す（遅延蓄積防止）
    while (!s_queue.empty() && s_queue.front().type == CmdType::SetAngles) {
        s_queue.pop_front();
    }
    s_queue.push_back(cmd);
}

}  // namespace

void ServoRequestSetHeadAngles(int yaw_deg, int pitch_deg, int speed)
{
    Cmd cmd;
    cmd.type = CmdType::SetAngles;
    cmd.yaw_deg = clamp_yaw(yaw_deg);
    cmd.pitch_deg = clamp_pitch(pitch_deg);
    cmd.speed = clamp_speed(speed > 0 ? speed : kDefaultSpeed);
    push_cmd(cmd);
}

void ServoRequestGoHome(int speed)
{
    Cmd cmd;
    cmd.type = CmdType::GoHome;
    cmd.speed = clamp_speed(speed > 0 ? speed : 400);
    push_cmd(cmd);
}

void ServoGetHeadAngles(int& yaw_deg, int& pitch_deg)
{
    yaw_deg = 0;
    pitch_deg = 0;
    if (!GetStackChan().hasAvatar()) {
        return;
    }
    auto& motion = GetStackChan().motion();
    yaw_deg = motion.yawServo().getCurrentAngle() / kDegToInternal;
    pitch_deg = motion.pitchServo().getCurrentAngle() / kDegToInternal;
}

void ServoApiDrain()
{
    std::deque<Cmd> local;
    {
        std::lock_guard<std::mutex> lock(s_mu);
        local.swap(s_queue);
    }
    if (local.empty()) {
        return;
    }
    // CUSTOM/アバター未準備のとき捨てると httpd 先行レースで「押したのに動かない」になる
    if (!GetStackChan().hasAvatar()) {
        std::lock_guard<std::mutex> lock(s_mu);
        while (!local.empty()) {
            s_queue.push_front(local.back());
            local.pop_back();
        }
        return;
    }

    auto& motion = GetStackChan().motion();
    for (const auto& cmd : local) {
        // modifyLock / 自動ジェスチャ中でもサーバ・制御ページ指令を通す
        stackchan::custom::BeginUserDirectedMotion();
        if (cmd.type == CmdType::GoHome) {
            motion.goHome(cmd.speed);
            ESP_LOGI(TAG, "goHome speed=%d", cmd.speed);
        } else {
            motion.moveWithSpeed(cmd.yaw_deg * kDegToInternal, cmd.pitch_deg * kDegToInternal, cmd.speed);
            ESP_LOGI(TAG, "set_head yaw=%d pitch=%d speed=%d", cmd.yaw_deg, cmd.pitch_deg, cmd.speed);
        }
        stackchan::custom::EndUserDirectedMotion();
    }
}

}  // namespace stackchan::obake
