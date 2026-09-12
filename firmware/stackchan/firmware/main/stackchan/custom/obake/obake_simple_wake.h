/*
 * 「おばけちゃん」SimpleVox（MFCC+DTW）ウェイク。
 * AI_StackChan2 / Ex と同じ系統。Xiaozhi WakeWord インタフェース実装。
 */
#pragma once

#include "audio/wake_word.h"

#include <atomic>
#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <string>
#include <vector>

namespace stackchan::obake {

class ObakeSimpleWakeWord : public WakeWord {
public:
    ObakeSimpleWakeWord();
    ~ObakeSimpleWakeWord() override;

    bool Initialize(AudioCodec* codec, srmodel_list_t* models_list) override;
    void Feed(const std::vector<int16_t>& data) override;
    void OnWakeWordDetected(std::function<void(const std::string& wake_word)> callback) override;
    void Start() override;
    void Stop() override;
    size_t GetFeedSize() override;
    void EncodeWakeWordData() override;
    bool GetWakeWordOpus(std::vector<uint8_t>& opus) override;
    const std::string& GetLastDetectedWakeWord() const override;

    /** テンプレート登録済みか */
    static bool HasTemplate();
    /** 登録モード開始（次の発話区間をテンプレにする） */
    static void BeginEnroll();
    /** 登録中か */
    static bool IsEnrolling();

private:
    bool load_template_from_nvs();
    bool save_template_to_nvs(const class simplevox::MfccFeature& feat);
    void handle_detected_pcm(const int16_t* pcm, int len);

    AudioCodec* codec_ = nullptr;
    bool running_ = false;
    std::function<void(const std::string&)> callback_;
    std::string last_wake_;

    // SimpleVox 本体は cpp 側で保持（ヘッダ汚染回避用の opaque）
    struct Impl;
    Impl* impl_ = nullptr;

    std::deque<std::vector<int16_t>> wake_pcm_;
    std::deque<std::vector<uint8_t>> wake_opus_;
    std::mutex wake_mutex_;
    std::condition_variable wake_cv_;
};

/** AudioService 差し込み用ファクトリ */
WakeWord* CreateObakeSimpleWakeWord();

}  // namespace stackchan::obake
