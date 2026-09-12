#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebSocketsClient.h>
#include "network.h"

namespace {
constexpr char DEVICE_TOKEN[] = "wiredspider-device-4826";
WebSocketsClient socket;
WiFiUDP discovery;
QueueHandle_t commands = nullptr;
portMUX_TYPE stateLock = portMUX_INITIALIZER_UNLOCKED;
DeviceTelemetry state{};
bool connected = false;
bool configured = false;
IPAddress serverIP;

void onSocket(WStype_t type, uint8_t* payload, size_t length) {
  if (type == WStype_CONNECTED) {
    connected = true;
    socket.sendTXT("{\"type\":\"hello\",\"device\":\"wiredspider\"}");
    Serial.println("Central WebSocket connected");
  } else if (type == WStype_DISCONNECTED) {
    connected = false;
  } else if (type == WStype_TEXT) {
    if (length == 0 || length > 95 || memchr(payload, 0, length)) return;
    char message[96];
    memcpy(message, payload, length);
    message[length] = 0;
    ControlCommand command;
    if (!parseControlCommand(message, command)) {
      socket.sendTXT("{\"type\":\"error\",\"message\":\"Invalid command\"}");
      return;
    }
    if (command.type == CommandType::Stop && command.target == 0) xQueueReset(commands);
    if (xQueueSend(commands, &command, 0) != pdTRUE) {
      socket.sendTXT("{\"type\":\"error\",\"message\":\"Command queue full\"}");
    } else {
      socket.sendTXT("{\"type\":\"queued\"}");
    }
  }
}

void networkTask(void*) {
  discovery.begin(4210);
  socket.onEvent(onSocket);
  socket.setReconnectInterval(2000);
  uint32_t lastPublish = 0;
  for (;;) {
    const int packetSize = discovery.parsePacket();
    if (packetSize > 0) {
      char message[96] = {};
      const int size = discovery.read(message, sizeof(message) - 1);
      char expected[96];
      snprintf(expected, sizeof(expected), "WIREDSPIDER/1 8000 %s", DEVICE_TOKEN);
      const IPAddress remote = discovery.remoteIP();
      if (size > 0 && !strcmp(message, expected) && remote[0] == 192 &&
          remote[1] == 168 && remote[2] == 4 && remote[3] != 1 &&
          (!configured || (!connected && remote != serverIP))) {
        serverIP = remote;
        configured = true;
        char path[96];
        snprintf(path, sizeof(path), "/device?token=%s", DEVICE_TOKEN);
        socket.begin(serverIP.toString(), 8000, path);
        Serial.println("Central server discovered");
      }
    }
    if (configured) socket.loop();
    const uint32_t now = millis();
    if (connected && static_cast<uint32_t>(now - lastPublish) >= 200) {
      lastPublish = now;
      DeviceTelemetry copy;
      portENTER_CRITICAL(&stateLock);
      copy = state;
      portEXIT_CRITICAL(&stateLock);
      char output[1200];
      formatState(copy, output, sizeof(output));
      socket.sendTXT(output);
    }
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}
}  // namespace

bool startNetwork() {
  commands = xQueueCreate(16, sizeof(ControlCommand));
  if (!commands) return false;
  WiFi.mode(WIFI_AP);
  const IPAddress ip(192, 168, 4, 1);
  if (!WiFi.softAPConfig(ip, ip, IPAddress(255, 255, 255, 0)) ||
      !WiFi.softAP("WiredSpider", "spider-4826", 6, false, 4)) return false;
  if (xTaskCreatePinnedToCore(networkTask, "network", 12288, nullptr, 1, nullptr, 0) != pdPASS) return false;
  Serial.println("Wi-Fi AP: WiredSpider / password: spider-4826");
  Serial.println("Connect central PC to this AP; dashboard runs on PC port 8000.");
  return true;
}

bool takeNetworkCommand(ControlCommand& command) {
  return commands && xQueueReceive(commands, &command, 0) == pdTRUE;
}

void publishNetworkState(const DeviceTelemetry& snapshot) {
  portENTER_CRITICAL(&stateLock);
  state = snapshot;
  portEXIT_CRITICAL(&stateLock);
}
