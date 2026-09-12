#pragma once
#include <stdint.h>
#include <string.h>

namespace rail {
struct Command {
  bool local = false;
  bool stop = false;
  int8_t axis = -1;
  int8_t direction = 0;
  uint32_t durationMs = 0;
  uint64_t expiresAtMs = 0;
  char id[64] = {};
};
struct Axis {
  bool local = false;
  bool active = false;
  bool pending = false;
  int8_t direction = 0;
  uint32_t since = 0, durationMs = 0;
  uint64_t expiresAtMs = 0;
  char id[64] = {};
};
struct IO {
  void (*drive)(uint8_t axis, int8_t direction);
  void (*release)(uint8_t axis);
  void (*report)(const char* id, const char* status, const char* message);
};

class Controller {
 public:
  explicit Controller(IO io) : io_(io) {}
  const Axis& axis(unsigned index) const { return axes_[index]; }

  void apply(const Command& cmd, uint32_t now, uint64_t utc) {
    if (!cmd.id[0]) return;
    for (const auto& entry : seen_) {
      if (!strcmp(entry.id, cmd.id)) {
        if (strcmp(entry.status, "pending")) io_.report(cmd.id, entry.status, "Duplicate; not re-executed");
        return;
      }
    }
    if (cmd.stop) {
      if (cmd.axis < -1 || cmd.axis > 2) { finish(cmd.id, "failed", "Invalid axis"); return; }
      for (int i = 0; i < 3; ++i) if (cmd.axis == -1 || cmd.axis == i) cancel(i);
      finish(cmd.id, "stopped", "Output disabled");
      return;
    }
    if (cmd.axis < 0 || cmd.axis > 2 || (cmd.direction != 1 && cmd.direction != -1) ||
        cmd.durationMs < 1 || cmd.durationMs > 60000 || utc >= cmd.expiresAtMs) {
      finish(cmd.id, "failed", "Invalid or expired move");
      return;
    }
    auto& a = axes_[cmd.axis];
    const bool reverse = a.active && a.direction != cmd.direction;
    cancel(cmd.axis);
    a.pending = reverse;
    a.local = cmd.local;
    a.direction = cmd.direction;
    a.durationMs = cmd.durationMs;
    a.expiresAtMs = cmd.expiresAtMs;
    a.since = now;
    strcpy(a.id, cmd.id);
    remember(cmd.id, "pending");
    if (!reverse) start(cmd.axis, now);
  }

  void tick(uint32_t now, uint64_t utc) {
    for (uint8_t i = 0; i < 3; ++i) {
      auto& a = axes_[i];
      if (a.pending && static_cast<uint32_t>(now - a.since) >= 50) {
        if (utc >= a.expiresAtMs) {
          a.pending = false;
          finish(a.id, "failed", "Expired before reversal");
        } else start(i, now);
      }
      if (a.active && static_cast<uint32_t>(now - a.since) >= a.durationMs) {
        a.active = false;
        io_.release(i);
        finish(a.id, "completed", "Timed output finished");
      }
    }
  }

  void stopAll(const char* reason, bool remoteOnly = false) {
    for (uint8_t i = 0; i < 3; ++i) {
      auto& a = axes_[i];
      if ((a.active || a.pending) && (!remoteOnly || !a.local)) {
        a.active = a.pending = false;
        io_.release(i);
        finish(a.id, "failed", reason);
      }
    }
  }

 private:
  struct Seen { char id[64] = {}; char status[16] = {}; };
  Axis axes_[3];
  Seen seen_[32];
  unsigned next_ = 0;
  IO io_;
  void remember(const char* id, const char* status) {
    for (auto& entry : seen_) {
      if (!strcmp(entry.id, id)) { strcpy(entry.status, status); return; }
    }
    strcpy(seen_[next_].id, id);
    strcpy(seen_[next_].status, status);
    next_ = (next_ + 1) % 32;
  }
  void finish(const char* id, const char* status, const char* message) {
    remember(id, status);
    io_.report(id, status, message);
  }
  void cancel(uint8_t i) {
    auto& a = axes_[i];
    if (a.active || a.pending) remember(a.id, "failed");
    a.active = a.pending = false;
    io_.release(i);
  }
  void start(uint8_t i, uint32_t now) {
    auto& a = axes_[i];
    a.pending = false;
    a.active = true;
    a.since = now;
    io_.drive(i, a.direction);
    finish(a.id, "started", "Timed output started");
  }
};
}  // namespace rail
