import type { Box, TimeSpan, ViewTransform } from "../types";
import { finite } from "./finite";

export function createViewTransform(view: TimeSpan, box: Box): ViewTransform {
  const width = Math.max(finite(box.width, 0), 0);
  const duration = Math.max(finite(view.duration, 0), 0);
  const pxPerMs = duration > 0 && width > 0 ? width / duration : 0;

  return {
    pxPerMs,
    toPx: (ms) => (finite(ms, view.start) - view.start) * pxPerMs,
    toMs: (px) =>
      pxPerMs > 0 ? view.start + finite(px, 0) / pxPerMs : view.start,
  };
}
