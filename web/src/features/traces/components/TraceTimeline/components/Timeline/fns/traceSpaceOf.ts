import type { TimeSpan } from "../types";
import { finite } from "./finite";

export function traceSpaceOf(durationMs: number): TimeSpan {
  return { start: 0, duration: Math.max(finite(durationMs, 0), 0) };
}
