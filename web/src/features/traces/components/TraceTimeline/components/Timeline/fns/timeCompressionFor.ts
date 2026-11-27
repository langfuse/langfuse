import type {
  Box,
  LayoutNode,
  PreparedTimeline,
  TimeCompression,
} from "../types";
import { buildTimeCompression } from "./buildTimeCompression";
import { identityCompression } from "./identityCompression";

export function timeCompressionFor(
  prepared: PreparedTimeline<LayoutNode>,
  box: Box,
  compress: boolean,
): TimeCompression {
  return compress
    ? buildTimeCompression({
        spans: prepared.spans,
        durationMs: prepared.durationMs,
        physicalWidth: box.width,
        enabled: true,
      })
    : identityCompression(prepared.durationMs);
}
