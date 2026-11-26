import type { TimeCompression } from "../types";
import { identityCompression } from "./identityCompression";

type CompressedGap = {
  start: number;
  end: number;
  durationMs: number;
  compressedStart: number;
  compressedEnd: number;
};

export function compressionFromCollapsedGaps(options: {
  durationMs: number;
  physicalWidth: number;
  gaps: readonly { start: number; end: number }[];
  collapsedGapPx: number;
}): TimeCompression {
  const durationMs = Math.max(
    Number.isFinite(options.durationMs) ? options.durationMs : 0,
    0,
  );
  const physicalWidth = options.physicalWidth;
  const gapsIn = options.gaps.filter(
    (gap) =>
      Number.isFinite(gap.start) &&
      Number.isFinite(gap.end) &&
      gap.end > gap.start,
  );
  if (
    gapsIn.length === 0 ||
    durationMs <= 0 ||
    !Number.isFinite(physicalWidth) ||
    physicalWidth <= 0
  ) {
    return identityCompression(durationMs);
  }

  const collapsedGapPx = Math.min(
    Math.max(options.collapsedGapPx, 1),
    physicalWidth / (gapsIn.length + 1),
  );
  const gapWidthRatio = collapsedGapPx / physicalWidth;
  const collapsedDuration = gapsIn.reduce(
    (sum, gap) => sum + (gap.end - gap.start),
    0,
  );
  const activeDuration = durationMs - collapsedDuration;
  const denominator = 1 - gapWidthRatio * gapsIn.length;
  if (denominator <= 0 || activeDuration <= 0) {
    return identityCompression(durationMs);
  }

  const compressedDurationMs = activeDuration / denominator;
  const retainedDuration = compressedDurationMs * gapWidthRatio;
  let removedBefore = 0;
  const gaps: CompressedGap[] = gapsIn.map((gap) => {
    const compressedStart = gap.start - removedBefore;
    const duration = gap.end - gap.start;
    removedBefore += duration - retainedDuration;
    return {
      start: gap.start,
      end: gap.end,
      durationMs: duration,
      compressedStart,
      compressedEnd: compressedStart + retainedDuration,
    };
  });

  return {
    enabled: true,
    durationMs,
    compressedDurationMs,
    gaps,
    toCompressedMs: (realMs) =>
      mapRealToCompressed(realMs, gaps, retainedDuration),
    toRealMs: (compressedMs) =>
      mapCompressedToReal(compressedMs, gaps, retainedDuration),
  };
}

function mapRealToCompressed(
  realMs: number,
  gaps: readonly CompressedGap[],
  retainedDuration: number,
): number {
  let removed = 0;
  for (const gap of gaps) {
    if (realMs < gap.start) break;
    if (realMs <= gap.end) {
      const progress =
        gap.durationMs > 0 ? (realMs - gap.start) / gap.durationMs : 0;
      return gap.compressedStart + progress * retainedDuration;
    }
    removed += gap.durationMs - retainedDuration;
  }
  return realMs - removed;
}

function mapCompressedToReal(
  compressedMs: number,
  gaps: readonly CompressedGap[],
  retainedDuration: number,
): number {
  let restored = 0;
  for (const gap of gaps) {
    if (compressedMs < gap.compressedStart) break;
    if (compressedMs <= gap.compressedEnd) {
      const progress =
        retainedDuration > 0
          ? (compressedMs - gap.compressedStart) / retainedDuration
          : 0;
      return gap.start + progress * gap.durationMs;
    }
    restored += gap.durationMs - retainedDuration;
  }
  return compressedMs + restored;
}
