import { describe, expect, it } from "vitest";
import { compressionFromCollapsedGaps } from "./compressionFromCollapsedGaps";

describe("compressionFromCollapsedGaps", () => {
  it("keeps idle bands to half the lane and never longer than the gap", () => {
    const gapMs = 5 * 60_000;
    const activeSlice = 30_000;
    const count = 30;
    const gaps = Array.from({ length: count }, (_, index) => {
      const start = index * (gapMs + activeSlice);
      return { start, end: start + gapMs };
    });
    const durationMs = gaps[count - 1]!.end + activeSlice;
    const width = 1000;
    const compression = compressionFromCollapsedGaps({
      durationMs,
      physicalWidth: width,
      gaps,
      collapsedGapPx: 36,
    });

    const bandPx = compression.gaps.reduce((sum, gap) => {
      const slice = gap.compressedEnd - gap.compressedStart;
      return sum + (slice / compression.compressedDurationMs) * width;
    }, 0);
    expect(bandPx).toBeLessThanOrEqual(width * 0.5 + 0.5);
    expect(bandPx).toBeGreaterThan(width * 0.4);
    for (const gap of compression.gaps) {
      expect(gap.compressedEnd - gap.compressedStart).toBeLessThan(
        gap.durationMs,
      );
    }

    const stretched = compressionFromCollapsedGaps({
      durationMs: count * (gapMs + 60 * 60_000),
      physicalWidth: width,
      gaps: Array.from({ length: count }, (_, index) => {
        const start = index * (gapMs + 60 * 60_000);
        return { start, end: start + gapMs };
      }),
      collapsedGapPx: 36,
    });
    expect(stretched.enabled).toBe(false);
    expect(stretched.gaps).toHaveLength(0);
  });
});
