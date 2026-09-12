/*
 * SPDX-License-Identifier: MIT
 */
#include "ir_ui_labels.h"

#include <unordered_map>

namespace stackchan::ir {

namespace {

const char* Lookup(const std::unordered_map<std::string_view, const char*>& table, std::string_view key)
{
    const auto it = table.find(key);
    if (it != table.end()) {
        return it->second;
    }
    return nullptr;
}

const std::unordered_map<std::string_view, const char*> kDeviceLabels = {
    {"light", "ライト"},
    {"tv", "テレビ"},
    {"aircon", "エアコン"},
    {"speaker", "ラジオ"},
    {"unknown", "扇風機"},
};

const std::unordered_map<std::string_view, const char*> kActionLabels = {
    // light
    {"power", "電源"},
    {"bright_up", "明るさ+"},
    {"bright_down", "明るさ-"},
    {"color_cool", "色温度 冷"},
    {"color_warm", "色温度 暖"},
    {"sleep_timer", "タイマー"},
    {"full_light", "全灯"},
    // tv common
    {"input", "入力切替"},
    {"terrestrial", "地デジ"},
    {"bs_cs", "BS/CS"},
    {"mute", "消音"},
    {"vol_up", "音量+"},
    {"vol_down", "音量-"},
    {"ch_up", "チャンネル+"},
    {"ch_down", "チャンネル-"},
    {"submenu", "サブメニュー"},
    {"rec_list", "録画一覧"},
    {"guide", "番組表"},
    {"up", "上"},
    {"down", "下"},
    {"left", "左"},
    {"right", "右"},
    {"ok", "決定"},
    {"menu", "メニュー"},
    {"home", "ホーム"},
    {"return", "戻る"},
    {"ddata", "データ"},
    {"blue", "青"},
    {"red", "赤"},
    {"green", "緑"},
    {"yellow", "黄"},
    {"display", "表示"},
    {"cc", "字幕"},
    {"audio", "音声"},
    {"rewind", "巻戻し"},
    {"play", "再生"},
    {"pause", "一時停止"},
    {"ffwd", "早送り"},
    {"prev", "前"},
    {"rec", "録画"},
    {"stop", "停止"},
    {"next", "次"},
    {"3digit", "3桁入力"},
    {"netflix", "Netflix"},
    {"hulu", "Hulu"},
    {"unext", "U-NEXT"},
    {"abematv", "ABEMA"},
    {"youtube", "YouTube"},
    {"tver", "TVer"},
    // aircon
    {"cool_on", "冷房ON"},
    {"heat_on", "暖房ON"},
    {"off", "OFF"},
    {"temp_up", "温度+"},
    {"temp_down", "温度-"},
    {"mode", "モード"},
    {"fan", "送風"},
    {"swing", "スイング"},
    {"eco", "エコ"},
    {"fan_away", "風向き"},
    {"sleep", "睡眠"},
    {"streamer_clean", "ストリーマ清掃"},
    {"timer_off", "タイマーOFF"},
    {"timer_on", "タイマーON"},
    {"cancel", "取消"},
    {"cool_20", "冷房20度"},
    {"heat_20", "暖房20度"},
    {"dry_20", "除湿20度"},
    {"fan_only", "送風のみ"},
    // fan (unknown device)
    {"fan_power_kaseikyo", "電源(K)"},
    {"fan_power_raw67", "電源(R67)"},
    {"fan_power_raw39", "電源(R39)"},
    {"fan_power", "電源"},
    {"fan_speed_up", "風量+"},
    {"fan_speed_down", "風量-"},
    {"fan_swing", "首振り"},
    {"fan_timer", "タイマー"},
    // speaker
    {"play_pause", "再生/停止"},
    {"folder_next", "フォルダ次"},
    {"folder_prev", "フォルダ前"},
    {"speed_up", "速度+"},
    {"speed_down", "速度-"},
    {"source_sd", "SD"},
    {"source_fm", "FM"},
    {"source_line", "LINE"},
    {"sound", "サウンド"},
    {"bt_rx", "BT受信"},
    {"bt_tx", "BT送信"},
    {"dimmer", "調光"},
    {"program", "プログラム"},
    {"repeat", "リピート"},
    {"a_b", "A-B"},
    {"plus_10", "+10秒"},
    {"bookmark", "ブックマーク"},
    // numeric keys (tv / speaker)
    {"1", "1"},
    {"2", "2"},
    {"3", "3"},
    {"4", "4"},
    {"5", "5"},
    {"6", "6"},
    {"7", "7"},
    {"8", "8"},
    {"9", "9"},
    {"10", "10"},
    {"11", "11"},
    {"12", "12"},
};

std::string LabelOrId(const std::unordered_map<std::string_view, const char*>& table, std::string_view id)
{
    if (const char* label = Lookup(table, id)) {
        return label;
    }
    return std::string(id);
}

}  // namespace

std::string DeviceLabelJa(std::string_view device_id)
{
    return LabelOrId(kDeviceLabels, device_id);
}

std::string ActionLabelJa(std::string_view action_id)
{
    return LabelOrId(kActionLabels, action_id);
}

}  // namespace stackchan::ir
