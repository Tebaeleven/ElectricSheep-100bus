#include "../src/controller.h"
#include <cassert>
#include <iostream>
#include <string>
#include <vector>
static int outputs[3] = {};
static std::vector<std::string> events;
static void drive(uint8_t a, int8_t d) { outputs[a] = d; }
static void release(uint8_t a) { outputs[a] = 0; }
static void report(const char* id, const char* status, const char*) { events.push_back(std::string(id)+":"+status); }
static rail::Command move(const char* id, int axis, int dir, unsigned duration) {
  rail::Command c;
  strcpy(c.id,id); c.axis=axis; c.direction=dir; c.durationMs=duration; c.expiresAtMs=100000;
  return c;
}
int main() {
  rail::Controller c({drive,release,report});
  c.apply(move("a",0,1,3000),0,1);
  assert(outputs[0]==1 && events.back()=="a:started");
  c.tick(2999,3000); assert(outputs[0]==1);
  c.tick(3000,3001); assert(outputs[0]==0 && events.back()=="a:completed");
  c.apply(move("a",0,1,3000),4000,4001); assert(outputs[0]==0);
  c.apply(move("b",1,1,60000),4000,4001);
  c.apply(move("c",0,1,3000),4000,4001);
  c.apply(move("d",0,-1,1000),4500,4501);
  assert(outputs[0]==0 && outputs[1]==1);
  c.tick(4549,4550); assert(outputs[0]==0);
  c.tick(4550,4551); assert(outputs[0]==-1);
  c.tick(5549,5550); assert(outputs[0]==-1);
  c.tick(5550,5551); assert(outputs[0]==0 && outputs[1]==1);
  rail::Command stop; stop.stop=true; stop.axis=1; strcpy(stop.id,"stop");
  c.apply(stop,5551,5552); assert(outputs[1]==0 && events.back()=="stop:stopped");
  auto expired=move("expired",2,1,1000); expired.expiresAtMs=3;
  c.apply(expired,6000,6001); assert(outputs[2]==0 && events.back()=="expired:failed");
  c.apply(move("wrap",2,-1,1000),UINT32_MAX-499,7000);
  c.tick(499,7999); assert(outputs[2]==-1);
  c.tick(500,8000); assert(outputs[2]==0);
  c.apply(move("link",0,1,3000),9000,9001);
  c.stopAll("link lost"); assert(outputs[0]==0 && events.back()=="link:failed");
  c.apply(move("pending",0,1,3000),10000,10001);
  c.apply(move("pending-reverse",0,-1,3000),10001,10002);
  c.stopAll("link lost"); c.tick(10100,10101); assert(outputs[0]==0);
  auto local = move("local-http", 0, 1, 500); local.local = true;
  c.apply(local, 11000, 11001);
  c.apply(move("remote-ws", 1, 1, 3000), 11000, 11001);
  c.stopAll("link lost", true);
  assert(outputs[0] == 1 && outputs[1] == 0);
  c.tick(11500, 11501); assert(outputs[0] == 0);
  std::cout << "PASS: timed stop, replacement, reversal delay, independent axes, deduplication, expiry, timer wrap, link stop\n";
}
