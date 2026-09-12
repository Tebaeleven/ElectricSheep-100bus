/*
 * IR transmit via ESP-IDF RMT (no Arduino / IRremoteESP8266 dependency).
 * SPDX-License-Identifier: MIT
 */
#include "ir_sender.h"

#include "ir_nec_encoder.h"

#include <driver/gpio.h>
#include <driver/rmt_tx.h>
#include <esp_check.h>
#include <mooncake_log.h>

#include <vector>

static const std::string_view _tag = "IR-Send";

namespace stackchan::ir {

namespace {

constexpr uint32_t kIrResolutionHz = 1000000;  // 1 tick = 1 us
constexpr uint16_t kCarrierHz      = 38000;
constexpr float kCarrierDuty     = 0.33f;

rmt_channel_handle_t _tx_channel   = nullptr;
rmt_encoder_handle_t _nec_encoder  = nullptr;
rmt_encoder_handle_t _copy_encoder = nullptr;
bool _sender_ready                 = false;

bool WaitTxDone()
{
    if (_tx_channel == nullptr) {
        return false;
    }
    return rmt_tx_wait_all_done(_tx_channel, 1000) == ESP_OK;
}

bool TransmitEncoder(rmt_encoder_handle_t encoder, const void* payload, size_t payload_size)
{
    if (!_sender_ready || encoder == nullptr || payload == nullptr) {
        return false;
    }
    rmt_encoder_reset(encoder);
    rmt_transmit_config_t tx_cfg = {
        .loop_count = 0,
    };
    const esp_err_t err = rmt_transmit(_tx_channel, encoder, payload, payload_size, &tx_cfg);
    if (err != ESP_OK) {
        mclog::tagError(_tag, "rmt_transmit failed: {}", esp_err_to_name(err));
        return false;
    }
    return WaitTxDone();
}

bool SendRawTimings(const uint16_t* timings, size_t len, uint16_t carrier_hz)
{
    if (timings == nullptr || len == 0) {
        return false;
    }

    std::vector<rmt_symbol_word_t> symbols;
    symbols.reserve(len / 2 + 1);
    for (size_t i = 0; i + 1 < len; i += 2) {
        symbols.push_back(rmt_symbol_word_t{
            .duration0 = timings[i],
            .level0    = 1,
            .duration1 = timings[i + 1],
            .level1    = 0,
        });
    }
    if (len % 2 == 1) {
        symbols.push_back(rmt_symbol_word_t{
            .duration0 = timings[len - 1],
            .level0    = 1,
            .duration1 = 0,
            .level1    = 0,
        });
    }

    rmt_carrier_config_t carrier_cfg = {
        .frequency_hz = carrier_hz ? carrier_hz : kCarrierHz,
        .duty_cycle   = kCarrierDuty,
    };
    ESP_ERROR_CHECK_WITHOUT_ABORT(rmt_apply_carrier(_tx_channel, &carrier_cfg));

    return TransmitEncoder(_copy_encoder, symbols.data(), symbols.size() * sizeof(rmt_symbol_word_t));
}

bool SendNecDecoded(uint16_t address, uint16_t command)
{
    const ir_nec_scan_code_t scan_code = {
        .address = address,
        .command = command,
    };
    rmt_carrier_config_t carrier_cfg = {
        .frequency_hz = kCarrierHz,
        .duty_cycle   = kCarrierDuty,
    };
    ESP_ERROR_CHECK_WITHOUT_ABORT(rmt_apply_carrier(_tx_channel, &carrier_cfg));
    return TransmitEncoder(_nec_encoder, &scan_code, sizeof(scan_code));
}

}  // namespace

void InitSender()
{
    if (_sender_ready) {
        return;
    }

    rmt_tx_channel_config_t tx_cfg = {
        .gpio_num           = static_cast<gpio_num_t>(kIrSendGpio),
        .clk_src            = RMT_CLK_SRC_DEFAULT,
        .resolution_hz      = kIrResolutionHz,
        .mem_block_symbols  = 128,
        .trans_queue_depth  = 2,
    };
    ESP_ERROR_CHECK(rmt_new_tx_channel(&tx_cfg, &_tx_channel));

    ir_nec_encoder_config_t nec_cfg = {
        .resolution = kIrResolutionHz,
    };
    ESP_ERROR_CHECK(rmt_new_ir_nec_encoder(&nec_cfg, &_nec_encoder));

    rmt_copy_encoder_config_t copy_cfg = {};
    ESP_ERROR_CHECK(rmt_new_copy_encoder(&copy_cfg, &_copy_encoder));

    ESP_ERROR_CHECK(rmt_enable(_tx_channel));
    _sender_ready = true;
    mclog::tagInfo(_tag, "RMT IR sender on GPIO{}", kIrSendGpio);
}

bool SendSignal(const IrSignal& signal)
{
    InitSender();
    if (!_sender_ready) {
        return false;
    }

    if (signal.type == IrSignalType::Raw) {
        if (signal.rawData == nullptr || signal.rawLen == 0) {
            mclog::tagError(_tag, "raw signal empty");
            return false;
        }
        const bool ok = SendRawTimings(signal.rawData, signal.rawLen, kCarrierHz);
        mclog::tagInfo(_tag, "sendRaw len={} ok={}", signal.rawLen, ok);
        return ok;
    }

    if (signal.protocol != NEC) {
        mclog::tagWarn(_tag, "unsupported protocol {}", static_cast<int>(signal.protocol));
        return false;
    }

    const bool ok = SendNecDecoded(signal.address, signal.command);
    mclog::tagInfo(_tag, "send NEC addr=0x{:X} cmd=0x{:X} ok={}", signal.address, signal.command, ok);
    return ok;
}

}  // namespace stackchan::ir
