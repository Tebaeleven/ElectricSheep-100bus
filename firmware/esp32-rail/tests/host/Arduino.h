#pragma once
#include <cstdint>
#include <deque>
#include <string>
#include <vector>

constexpr int LOW = 0;
constexpr int HIGH = 1;
constexpr int OUTPUT = 1;
extern uint32_t clockUs;
extern int levels[40];
extern std::vector<int> writes;
inline uint32_t micros() { return clockUs; }
inline void delay(unsigned long ms) { clockUs += ms * 1000; }
inline void pinMode(uint8_t, int) {}
inline void digitalWrite(uint8_t pin, int level) {
  levels[pin] = level;
  writes.push_back(pin);
}
struct FakeSerial {
  unsigned long baud = 0;
  std::deque<char> input;
  std::string output;
  void begin(unsigned long value) { baud = value; }
  int available() { return static_cast<int>(input.size()); }
  int read() {
    const char value = input.front();
    input.pop_front();
    return value;
  }
  void println(const char* value = "") { output += std::string(value) + "\n"; }
};
extern FakeSerial Serial;
