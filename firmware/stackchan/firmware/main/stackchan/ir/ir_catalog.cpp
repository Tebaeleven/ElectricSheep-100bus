/*
 * SPDX-License-Identifier: MIT
 */
#include "ir_catalog.h"

#include "ir_catalog_internal.h"
#include "ir_sender.h"

#include <mooncake_log.h>

#include <fmt/format.h>

#include <algorithm>
#include <cctype>
#include <cstring>
#include <unordered_map>
#include <unordered_set>

static const std::string_view _tag = "IR-Catalog";

namespace stackchan::ir {

namespace {

int CompareIgnoreCase(std::string_view a, std::string_view b)
{
    if (a.size() != b.size()) {
        return static_cast<int>(a.size()) - static_cast<int>(b.size());
    }
    for (size_t i = 0; i < a.size(); ++i) {
        const char ca = static_cast<char>(std::tolower(static_cast<unsigned char>(a[i])));
        const char cb = static_cast<char>(std::tolower(static_cast<unsigned char>(b[i])));
        if (ca != cb) {
            return ca - cb;
        }
    }
    return 0;
}

const IrActionEntry* FindEntry(std::string_view device, std::string_view action)
{
    for (size_t i = 0; i < kIrActionTableSize; ++i) {
        const auto& e = kIrActionTable[i];
        if (CompareIgnoreCase(e.device, device) == 0 && CompareIgnoreCase(e.action, action) == 0) {
            return &e;
        }
    }
    return nullptr;
}

}  // namespace

void Init()
{
    InitSender();
    mclog::tagInfo(_tag, "catalog entries={}", kIrActionTableSize);
}

bool SendAction(std::string_view device, std::string_view action)
{
    const IrActionEntry* entry = FindEntry(device, action);
    if (entry == nullptr || entry->signal == nullptr) {
        mclog::tagWarn(_tag, "unknown action device={} action={}", device, action);
        return false;
    }
    return SendSignal(*entry->signal);
}

std::vector<std::string> ListDevices()
{
    std::unordered_set<std::string> devices;
    for (size_t i = 0; i < kIrActionTableSize; ++i) {
        devices.insert(kIrActionTable[i].device);
    }
    std::vector<std::string> out(devices.begin(), devices.end());
    std::sort(out.begin(), out.end());
    return out;
}

std::vector<std::string> ListActions(std::string_view device)
{
    std::vector<std::string> out;
    for (size_t i = 0; i < kIrActionTableSize; ++i) {
        if (CompareIgnoreCase(kIrActionTable[i].device, device) == 0) {
            out.emplace_back(kIrActionTable[i].action);
        }
    }
    std::sort(out.begin(), out.end());
    return out;
}

std::string ListCatalogJson()
{
    std::string json = "[";
    const auto devices = ListDevices();
    bool first_device  = true;
    for (const auto& device : devices) {
        if (!first_device) {
            json += ',';
        }
        first_device = false;
        json += fmt::format(R"({{"device":"{}","actions":[)", device);
        const auto actions = ListActions(device);
        for (size_t i = 0; i < actions.size(); ++i) {
            if (i > 0) {
                json += ',';
            }
            json += fmt::format(R"("{}")", actions[i]);
        }
        json += "]}";
    }
    json += "]";
    return json;
}

}  // namespace stackchan::ir
