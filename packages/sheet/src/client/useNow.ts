"use client";

// The clock a sheet's date columns are bucketed against ("Today", "This week"). It reads 0 during a server render,
// where the current time isn't allowed, and ticks every 30 seconds once the sheet is in the browser.
import { useSyncExternalStore } from "react";

let clock = 0;
function subscribeClock(onTick: () => void) {
  clock = Date.now();
  const timer = setInterval(() => {
    clock = Date.now();
    onTick();
  }, 30_000);
  return () => clearInterval(timer);
}

export function useNow() {
  return useSyncExternalStore(subscribeClock, () => clock, () => 0);
}
