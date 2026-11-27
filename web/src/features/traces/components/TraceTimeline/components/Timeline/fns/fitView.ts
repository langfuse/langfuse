import type { TimeSpan } from "../types";

export function fitView(space: TimeSpan): TimeSpan {
  return { start: space.start, duration: space.duration };
}
