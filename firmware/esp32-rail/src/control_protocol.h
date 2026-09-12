#pragma once
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <ctype.h>

enum class CommandType { Run, Move, Stop, Speed, Alternate, Timed };
struct ControlCommand { CommandType type; uint8_t target; int32_t value; };
struct MotorTelemetry {
  uint8_t id, mode;
  int8_t direction;
  uint32_t intervalUs, currentIntervalUs, remaining, timedRemainingMs;
  int64_t position;
  uint64_t total;
};
struct DeviceTelemetry {
  uint32_t uptimeMs, sequence, periodMs;
  bool alternating;
  MotorTelemetry motors[2];
};

inline bool parseControlCommand(const char* input, ControlCommand& result) {
  if (!input || strlen(input) > 95) return false;
  while (isspace(static_cast<unsigned char>(*input))) ++input;
  char verb[12] = {};
  unsigned n = 0;
  while (*input && !isspace(static_cast<unsigned char>(*input))) {
    if (n >= sizeof(verb) - 1) return false;
    verb[n++] = *input++;
  }
  long args[2] = {};
  unsigned count = 0;
  for (;;) {
    while (isspace(static_cast<unsigned char>(*input))) ++input;
    if (!*input) break;
    if (count == 2) return false;
    char* end = nullptr;
    errno = 0;
    const long value = strtol(input, &end, 10);
    if (end == input || errno == ERANGE ||
        (*end && !isspace(static_cast<unsigned char>(*end)))) return false;
    args[count++] = value;
    input = end;
  }
  if (!strcmp(verb, "alternate")) {
    if (count != 1 || args[0] < 1000 || args[0] > 60000 || args[0] % 1000) return false;
    result = {CommandType::Alternate, 0, static_cast<int32_t>(args[0])};
    return true;
  }
  if (count < 1 || args[0] < 0 || args[0] > 2) return false;
  const uint8_t target = static_cast<uint8_t>(args[0]);
  if (!strcmp(verb, "stop") && count == 1) {
    result = {CommandType::Stop, target, 0};
    return true;
  }
  if (count != 2) return false;
  if (!strcmp(verb, "timed") && args[1] != 0 && args[1] >= -60000 && args[1] <= 60000) {
    result = {CommandType::Timed, target, static_cast<int32_t>(args[1])};
    return true;
  }
  if (!strcmp(verb, "run") && (args[1] == 1 || args[1] == -1)) {
    result = {CommandType::Run, target, static_cast<int32_t>(args[1])};
    return true;
  }
  if (!strcmp(verb, "move") && args[1] != 0 && args[1] >= -1000000 && args[1] <= 1000000) {
    result = {CommandType::Move, target, static_cast<int32_t>(args[1])};
    return true;
  }
  if (!strcmp(verb, "speed") && args[1] >= 500 && args[1] <= 10000) {
    result = {CommandType::Speed, target, static_cast<int32_t>(args[1])};
    return true;
  }
  return false;
}

inline void formatState(const DeviceTelemetry& s, char* output, size_t size) {
  const auto& a = s.motors[0];
  const auto& b = s.motors[1];
  snprintf(output, size,
    "{\"type\":\"state\",\"sequence\":%lu,\"uptime_ms\":%lu,\"alternating\":%s,\"period_ms\":%lu,"
    "\"motors\":[{\"id\":1,\"mode\":%u,\"direction\":%d,\"interval_us\":%lu,\"current_interval_us\":%lu,\"remaining\":%lu,\"timed_remaining_ms\":%lu,\"position_steps\":%lld,\"total_steps\":%llu},"
    "{\"id\":2,\"mode\":%u,\"direction\":%d,\"interval_us\":%lu,\"current_interval_us\":%lu,\"remaining\":%lu,\"timed_remaining_ms\":%lu,\"position_steps\":%lld,\"total_steps\":%llu}]}",
    static_cast<unsigned long>(s.sequence), static_cast<unsigned long>(s.uptimeMs),
    s.alternating ? "true" : "false", static_cast<unsigned long>(s.periodMs),
    a.mode, a.direction, static_cast<unsigned long>(a.intervalUs), static_cast<unsigned long>(a.currentIntervalUs),
    static_cast<unsigned long>(a.remaining), static_cast<unsigned long>(a.timedRemainingMs), static_cast<long long>(a.position), static_cast<unsigned long long>(a.total),
    b.mode, b.direction, static_cast<unsigned long>(b.intervalUs), static_cast<unsigned long>(b.currentIntervalUs),
    static_cast<unsigned long>(b.remaining), static_cast<unsigned long>(b.timedRemainingMs), static_cast<long long>(b.position), static_cast<unsigned long long>(b.total));
}
