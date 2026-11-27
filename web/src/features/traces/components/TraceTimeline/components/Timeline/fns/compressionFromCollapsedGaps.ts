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

  // Together the bands keep at most half the lane. A gap that the band would
  // draw longer than it lasted stays at its real length.
  const MAX_BAND_SHARE = 0.5;
  const requestedPx = Math.max(options.collapsedGapPx, 1);
  let selected = gapsIn;
  let collapsedGapPx = requestedPx;
  let compressedDurationMs = durationMs;
  let retainedDuration = 0;
  for (let pass = 0; pass <= gapsIn.length; pass++) {
    const count = selected.length;
    if (count === 0) return identityCompression(durationMs);
    collapsedGapPx = Math.min(
      requestedPx,
      (physicalWidth * MAX_BAND_SHARE) / count,
    );
    const gapWidthRatio = collapsedGapPx / physicalWidth;
    const collapsedDuration = selected.reduce(
      (sum, gap) => sum + (gap.end - gap.start),
      0,
    );
    const activeDuration = durationMs - collapsedDuration;
    const denominator = 1 - gapWidthRatio * count;
    if (denominator <= 0 || activeDuration <= 0) {
      return identityCompression(durationMs);
    }
    compressedDurationMs = activeDuration / denominator;
    retainedDuration = compressedDurationMs * gapWidthRatio;
    const shrinking = selected.filter(
      (gap) => gap.end - gap.start > retainedDuration,
    );
    if (shrinking.length === selected.length) break;
    selected = shrinking;
  }
  if (selected.length === 0) return identityCompression(durationMs);

  let removedBefore = 0;
  const gaps: CompressedGap[] = selected.map((gap) => {
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
