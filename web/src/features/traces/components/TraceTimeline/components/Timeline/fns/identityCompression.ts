import type { TimeCompression } from "../types";

export function identityCompression(durationMs: number): TimeCompression {
  const duration = Math.max(Number.isFinite(durationMs) ? durationMs : 0, 0);
  return {
    enabled: false,
    durationMs: duration,
    compressedDurationMs: duration,
    gaps: [],
    toCompressedMs: (realMs) => realMs,
    toRealMs: (compressedMs) => compressedMs,
  };
}
