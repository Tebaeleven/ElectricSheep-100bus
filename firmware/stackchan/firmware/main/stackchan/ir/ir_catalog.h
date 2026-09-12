/*
 * StackChan IR catalog — multi-appliance control API.
 * SPDX-License-Identifier: MIT
 */
#pragma once

#include <string>
#include <string_view>
#include <vector>

namespace stackchan::ir {

inline constexpr const char* kVersion = "1.0.0";

void Init();

bool SendAction(std::string_view device, std::string_view action);

std::vector<std::string> ListDevices();
std::vector<std::string> ListActions(std::string_view device);

/** JSON array string for MCP: [{"device":"tv","actions":["power",...]}, ...] */
std::string ListCatalogJson();

}  // namespace stackchan::ir
