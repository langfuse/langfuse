import type { Viewport } from "../types";
import { finite } from "./finite";

export function viewportsEqual(a: Viewport, b: Viewport): boolean {
  const close = (x: number, y: number, epsilon: number) =>
    Math.abs(finite(x, 0) - finite(y, 0)) < epsilon;
  return (
    close(a.time.start, b.time.start, 0.001) &&
    close(a.time.duration, b.time.duration, 0.001) &&
    close(a.rows.start, b.rows.start, 0.0001) &&
    close(a.rows.count, b.rows.count, 0.0001)
  );
}
