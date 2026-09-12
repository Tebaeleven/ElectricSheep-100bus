#pragma once
#include "control_protocol.h"
bool startNetwork();
bool takeNetworkCommand(ControlCommand& command);
void publishNetworkState(const DeviceTelemetry& state);
