"use client";

export function useVibration() {
  const vibrate = (ms = 10) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(ms);
    }
  };
  return { vibrate };
}
