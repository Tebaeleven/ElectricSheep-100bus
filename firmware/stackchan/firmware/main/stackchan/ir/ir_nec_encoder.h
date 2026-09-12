/*
 * SPDX-FileCopyrightText: 2021-2022 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: Apache-2.0
 *
 * Adapted from ESP-IDF example: examples/peripherals/rmt/ir_nec_transceiver
 */
#pragma once

#include <stdint.h>
#include "driver/rmt_encoder.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint16_t address;
    uint16_t command;
} ir_nec_scan_code_t;

typedef struct {
    uint32_t resolution;
} ir_nec_encoder_config_t;

esp_err_t rmt_new_ir_nec_encoder(const ir_nec_encoder_config_t* config, rmt_encoder_handle_t* ret_encoder);

#ifdef __cplusplus
}
#endif
