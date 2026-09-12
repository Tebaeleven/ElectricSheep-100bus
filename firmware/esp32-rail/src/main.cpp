#include <Arduino.h>

namespace {
// IN1, IN2, IN3, IN4: keep this wiring order.
constexpr uint8_t MOTOR_PINS[4] = {13, 14, 16, 17};
constexpr uint8_t MOTOR2_PINS[4] = {18, 19, 21, 22};
constexpr uint32_t STEPS_PER_REV = 4096;  // Approximate; calibrate on hardware.
constexpr uint32_t STEP_INTERVAL_US = 500;
constexpr uint32_t DIRECTION_INTERVAL_US = 10000000;
constexpr uint32_t START_INTERVAL_US = 2000;
constexpr uint32_t ACCELERATION_US_PER_STEP = 2;
constexpr uint8_t HALF_STEP_SEQUENCE[8][4] = {
    {1, 0, 0, 0},
    {1, 1, 0, 0},
    {0, 1, 0, 0},
    {0, 1, 1, 0},
    {0, 0, 1, 0},
    {0, 0, 1, 1},
    {0, 0, 0, 1},
    {1, 0, 0, 1},
};

// Each motor owns its pins, phase and timing for later multi-motor use.
class HalfStepMotor {
 public:
  HalfStepMotor(const uint8_t (&pins)[4], uint32_t intervalUs)
      : intervalUs_(intervalUs) {
    for (uint8_t i = 0; i < 4; ++i) {
      pins_[i] = pins[i];
    }
  }

  void begin() {
    for (uint8_t pin : pins_) {
      digitalWrite(pin, LOW);
      pinMode(pin, OUTPUT);
    }
    stop();
  }

  void move(int8_t direction, uint32_t steps) {
    if (steps == 0) {
      stop();
      return;
    }
    remainingSteps_ = steps;
    start(direction, Mode::Finite);
  }

  void run(int8_t direction) {
    remainingSteps_ = 0;
    start(direction, Mode::Continuous);
  }

  void stop() {
    mode_ = Mode::Stopped;
    remainingSteps_ = 0;
    for (uint8_t pin : pins_) {
      digitalWrite(pin, LOW);
    }
  }

  // Call frequently. Returns true once a finite move has finished.
  bool update(uint32_t nowUs) {
    if (mode_ == Mode::Stopped ||
        static_cast<uint32_t>(nowUs - lastStepUs_) < currentIntervalUs_) {
      return false;
    }
    // Hold the last phase for a full interval before releasing the coils.
    if (mode_ == Mode::Finite && remainingSteps_ == 0) {
      stop();
      return true;
    }

    // Do not emit a burst of catch-up steps if the loop was delayed.
    lastStepUs_ = nowUs;
    phase_ = static_cast<uint8_t>((phase_ + (direction_ > 0 ? 1 : 7)) % 8);
    for (uint8_t i = 0; i < 4; ++i) {
      digitalWrite(pins_[i], HALF_STEP_SEQUENCE[phase_][i] ? HIGH : LOW);
    }
    if (mode_ == Mode::Finite) {
      --remainingSteps_;
    }
    if (currentIntervalUs_ > intervalUs_) {
      const uint32_t difference = currentIntervalUs_ - intervalUs_;
      currentIntervalUs_ -= difference < ACCELERATION_US_PER_STEP
                                ? difference : ACCELERATION_US_PER_STEP;
    }
    return false;
  }

 private:
  enum class Mode { Stopped, Finite, Continuous };

  void start(int8_t direction, Mode mode) {
    direction_ = direction > 0 ? 1 : -1;
    mode_ = mode;
    currentIntervalUs_ = intervalUs_ < START_INTERVAL_US
                             ? START_INTERVAL_US : intervalUs_;
    lastStepUs_ = micros();
  }

  uint8_t pins_[4];
  const uint32_t intervalUs_;
  uint32_t currentIntervalUs_ = START_INTERVAL_US;
  uint8_t phase_ = 0;
  int8_t direction_ = 1;
  Mode mode_ = Mode::Stopped;
  uint32_t remainingSteps_ = 0;
  uint32_t lastStepUs_ = 0;
};

HalfStepMotor motor(MOTOR_PINS, STEP_INTERVAL_US);
HalfStepMotor motor2(MOTOR2_PINS, STEP_INTERVAL_US);
HalfStepMotor* selectedMotor = &motor;
bool alternating = false;
int8_t alternatingDirection = 1;
uint32_t lastDirectionChangeUs = 0;

void runBoth(int8_t direction) {
  motor.run(direction);
  motor2.run(direction);
  Serial.println(direction > 0 ? "Both: forward (10 seconds)"
                               : "Both: backward (10 seconds)");
}

void cancelAlternating() {
  if (alternating) {
    alternating = false;
    motor.stop();
    motor2.stop();
  }
}

void updateAlternating(uint32_t nowUs) {
  if (alternating &&
      static_cast<uint32_t>(nowUs - lastDirectionChangeUs) >= DIRECTION_INTERVAL_US) {
    lastDirectionChangeUs = nowUs;
    alternatingDirection = -alternatingDirection;
    runBoth(alternatingDirection);
  }
}

void printHelp() {
  Serial.println("=== 28BYJ-48 Motor Test ===");
  Serial.println("1 / 2 : select motor (default: Motor 1)");
  Serial.println("a : BOTH motors alternate forward/backward every 10 seconds");
  Serial.println("f : forward ~1 revolution (4096 half-steps)");
  Serial.println("b : backward ~1 revolution (4096 half-steps)");
  Serial.println("r : continuous forward");
  Serial.println("l : continuous backward");
  Serial.println("s : stop BOTH motors / coils off");
  Serial.println("f/b/r/l cancel alternation, stop both, then operate the selected motor.");
  Serial.println("New motion commands replace the current move.");
}

void handleSerial() {
  // Bound input handling so each motor can still be serviced under load.
  for (uint8_t count = 0; count < 16 && Serial.available() > 0; ++count) {
    const char command = static_cast<char>(Serial.read());
    switch (command) {
      case 'a':
      case 'A':
        alternating = true;
        alternatingDirection = 1;
        lastDirectionChangeUs = micros();
        runBoth(alternatingDirection);
        break;
      case '1':
        selectedMotor = &motor;
        Serial.println("Selected Motor 1");
        break;
      case '2':
        selectedMotor = &motor2;
        Serial.println("Selected Motor 2");
        break;
      case 'f':
      case 'F':
        cancelAlternating();
        selectedMotor->move(1, STEPS_PER_REV);
        Serial.println("Forward: ~1 revolution");
        break;
      case 'b':
      case 'B':
        cancelAlternating();
        selectedMotor->move(-1, STEPS_PER_REV);
        Serial.println("Backward: ~1 revolution");
        break;
      case 'r':
      case 'R':
        cancelAlternating();
        selectedMotor->run(1);
        Serial.println("Continuous forward");
        break;
      case 'l':
      case 'L':
        cancelAlternating();
        selectedMotor->run(-1);
        Serial.println("Continuous backward");
        break;
      case 's':
      case 'S':
        alternating = false;
        motor.stop();
        motor2.stop();
        Serial.println("STOP: coils off");
        break;
      case '\n':
      case '\r':
      case ' ':
      case '\t':
        break;
      default:
        printHelp();
        break;
    }
  }
}
}  // namespace

void setup() {
  motor.begin();
  motor2.begin();
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("ESP32 + ULN2003 + 28BYJ-48 ready. Coils off.");
  printHelp();
}

void loop() {
  handleSerial();
  updateAlternating(micros());
  const uint32_t nowUs = micros();
  if (motor.update(nowUs)) {
    Serial.println("Motor 1");
    Serial.println("Done: coils off");
  }
  if (motor2.update(nowUs)) {
    Serial.println("Motor 2");
    Serial.println("Done: coils off");
  }
}
