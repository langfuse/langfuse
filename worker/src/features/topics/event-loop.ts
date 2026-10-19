import { setImmediate as yieldToEventLoop } from "node:timers/promises";

const WORK_SLICE_MS = 8;

/** Checks between synchronous work units without allocating a promise until yielding. */
export function createEventLoopYielder() {
  let deadline = performance.now() + WORK_SLICE_MS;
  return () => {
    if (performance.now() < deadline) return;
    return yieldToEventLoop().then(() => {
      deadline = performance.now() + WORK_SLICE_MS;
    });
  };
}
