#include "Arduino.h"
#include <cassert>
#include <iostream>

uint32_t clockUs = 0;
int levels[40] = {};
std::vector<int> writes;
FakeSerial Serial;

#include "../../src/main.cpp"

static void command(char value) {
  Serial.input.push_back(value);
  loop();
}

static unsigned mask() {
  return levels[13] | (levels[14] << 1) | (levels[16] << 2) | (levels[17] << 3);
}

static unsigned mask2() {
  return levels[18] | (levels[19] << 1) | (levels[21] << 2) | (levels[22] << 3);
}

static void tick(uint32_t elapsed = START_INTERVAL_US) {
  clockUs += elapsed;
  loop();
}

int main() {
  setup();
  assert(Serial.baud == 115200 && mask() == 0 && mask2() == 0);
  for (int pin : writes) {
    assert(pin == 13 || pin == 14 || pin == 16 || pin == 17 ||
           pin == 18 || pin == 19 || pin == 21 || pin == 22);
  }

  // Verify physical output patterns, count and final dwell in both directions.
  const unsigned forward[] = {3, 2, 6, 4, 12, 8, 9, 1};
  const unsigned backward[] = {9, 8, 12, 4, 6, 2, 3, 1};
  for (char direction : {'f', 'b'}) {
    command(direction);
    writes.clear();
    tick(START_INTERVAL_US - 1);
    assert(writes.empty());
    tick(1);
    assert(mask() == (direction == 'f' ? forward[0] : backward[0]));
    for (unsigned step = 1; step < 4096; ++step) {
      tick();
      assert(mask() == (direction == 'f' ? forward[step % 8] : backward[step % 8]));
    }
    assert(writes.size() == 4096 * 4 && mask() != 0);
    tick(STEP_INTERVAL_US - 1);
    assert(mask() != 0);
    tick(1);
    assert(mask() == 0);
    const auto count = writes.size();
    tick();
    assert(writes.size() == count);
  }

  // Stop interrupts finite and continuous commands before their next step.
  for (char action : {'F', 'B', 'r', 'l'}) {
    command(action);
    tick();
    assert(mask() != 0);
    command('S');
    assert(mask() == 0);
    writes.clear();
    tick(10000000);
    assert(writes.empty());
  }

  command('R');
  for (unsigned step = 0; step < 4100; ++step) tick();
  assert(mask() != 0);
  command('b');  // Finite move replaces continuous mode.
  for (unsigned step = 0; step < 4097; ++step) tick();
  assert(mask() == 0);

  // Unsigned elapsed time survives micros() wrap and never catches up in bursts.
  clockUs = UINT32_MAX - 999;
  command('L');
  writes.clear();
  tick(START_INTERVAL_US - 1);
  assert(writes.empty());
  tick(1);
  assert(writes.size() == 4);
  tick(100000);
  assert(writes.size() == 8);
  loop();
  assert(writes.size() == 8);
  command('s');
  // Acceleration starts slowly, reaches the target, and restarts after stop.
  command('r');
  writes.clear();
  tick(START_INTERVAL_US);
  assert(writes.size() == 4);
  const uint32_t firstReduction = STEP_INTERVAL_US < START_INTERVAL_US
                                      ? ACCELERATION_US_PER_STEP : 0;
  tick(START_INTERVAL_US - firstReduction - 1);
  assert(writes.size() == 4);
  tick(1);
  assert(writes.size() == 8);
  for (unsigned step = 0; step < 1000; ++step) tick();
  writes.clear();
  tick(STEP_INTERVAL_US - 1);
  assert(writes.empty());
  tick(1);
  assert(writes.size() == 4);
  command('s');
  command('r');
  writes.clear();
  tick(START_INTERVAL_US - 1);
  assert(writes.empty());
  tick(1);
  assert(writes.size() == 4);
  command('s');
  command('\r');
  command('\n');
  command('?');
  assert(mask() == 0);
  assert(Serial.output.find("Done: coils off") != std::string::npos);
  assert(mask2() == 0);  // Motor 1 commands never energized Motor 2.

  // Motor 2 uses its own wiring and sequence while Motor 1 is stopped.
  command('2');
  command('f');
  for (unsigned step = 0; step < 4096; ++step) {
    tick();
    assert(mask2() == forward[step % 8]);
    assert(mask() == 0);
  }
  tick();
  assert(mask2() == 0);

  // A finite reverse move on Motor 2 completes without stopping Motor 1.
  command('1');
  command('r');
  command('2');
  command('b');
  writes.clear();
  for (unsigned step = 0; step < 4096; ++step) {
    tick();
    assert(mask() != 0 && mask2() == backward[step % 8]);
  }
  assert(writes.size() == 4096 * 8);
  tick();
  assert(mask() != 0 && mask2() == 0);
  command('r');
  tick();
  assert(mask() != 0 && mask2() != 0);
  command('s');
  assert(mask() == 0 && mask2() == 0);
  writes.clear();
  tick();
  assert(writes.empty());
  // Ten-second alternation survives clock wrap; both motors reverse phases.
  clockUs = UINT32_MAX - 1000000;
  Serial.output.clear();
  command('a');
  tick(DIRECTION_INTERVAL_US - 1);
  assert(Serial.output.find("Both: backward") == std::string::npos);
  const unsigned beforeReverse1 = mask();
  const unsigned beforeReverse2 = mask2();
  tick(1);
  assert(Serial.output.find("Both: backward (10 seconds)") != std::string::npos);
  tick(START_INTERVAL_US);
  const unsigned phaseOrder[] = {1, 3, 2, 6, 4, 12, 8, 9};
  for (unsigned i = 0; i < 8; ++i) {
    if (phaseOrder[i] == beforeReverse1) assert(mask() == phaseOrder[(i + 7) % 8]);
    if (phaseOrder[i] == beforeReverse2) assert(mask2() == phaseOrder[(i + 7) % 8]);
  }
  Serial.output.clear();
  tick(DIRECTION_INTERVAL_US - START_INTERVAL_US - 1);
  assert(Serial.output.empty());
  tick(1);
  assert(Serial.output.find("Both: forward (10 seconds)") != std::string::npos);
  command('s');
  writes.clear();
  Serial.output.clear();
  tick(DIRECTION_INTERVAL_US * 3);
  assert(mask() == 0 && mask2() == 0 && writes.empty() && Serial.output.empty());

  // A manual move cancels the repeating mode and stops the other motor.
  command('a');
  tick();
  command('1');
  command('r');
  tick();
  assert(mask() != 0 && mask2() == 0);
  Serial.output.clear();
  tick(DIRECTION_INTERVAL_US);
  assert(mask2() == 0 && Serial.output.empty());
  command('s');
  std::cout << "PASS: motor phases, timing, acceleration, independent control, 10-second alternation and cancellation\n";
}
