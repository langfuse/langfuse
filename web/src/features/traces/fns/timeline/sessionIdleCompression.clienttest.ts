import { describe, expect, it } from "vitest";
import { IDLE_GAP_THRESHOLD_SECONDS } from "@/src/features/sessions/sessionIdleGap";
import { prepareTimeline, type LayoutNode } from "./layout";
import {
  SESSION_IDLE_BAND_PX,
  sessionIdleCompression,
  sessionIdleGaps,
} from "./sessionIdleCompression";

const MINUTE = 60_000;

function trace(id: string, startMs: number, endMs: number): LayoutNode {
  return {
    id,
    name: id,
    type: "TRACE",
    startTime: new Date(startMs),
    endTime: new Date(endMs),
    children: [],
  };
}

describe("sessionIdleCompression", () => {
  it("collapses only gaps at least as long as the sidebar threshold", () => {
    const prepared = prepareTimeline([
      trace("a", 0, MINUTE),
      trace("b", MINUTE + 60_000, MINUTE + 120_000),
      trace(
        "c",
        MINUTE + 120_000 + IDLE_GAP_THRESHOLD_SECONDS * 1000,
        MINUTE + 180_000 + IDLE_GAP_THRESHOLD_SECONDS * 1000,
      ),
    ]);
    const gaps = sessionIdleGaps(prepared.rows, prepared.originMs);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.end - gaps[0]!.start).toBe(
      IDLE_GAP_THRESHOLD_SECONDS * 1000,
    );
  });

  it("maps time through a collapsed gap and back", () => {
    const idleMs = 54 * MINUTE;
    const prepared = prepareTimeline([
      trace("before", 0, MINUTE),
      trace("after", MINUTE + idleMs, MINUTE + idleMs + MINUTE),
    ]);
    const width = 1000;
    const compression = sessionIdleCompression({
      rows: prepared.rows,
      originMs: prepared.originMs,
      durationMs: prepared.durationMs,
      physicalWidth: width,
    });
    expect(compression).not.toBeNull();
    const mapped = compression!;

    expect(mapped.toCompressedMs(0)).toBeCloseTo(0, 5);
    expect(mapped.toRealMs(mapped.toCompressedMs(30_000))).toBeCloseTo(
      30_000,
      3,
    );

    const gap = mapped.gaps[0]!;
    const mid = (gap.start + gap.end) / 2;
    const compressedMid = mapped.toCompressedMs(mid);
    expect(compressedMid).toBeGreaterThan(gap.compressedStart);
    expect(compressedMid).toBeLessThan(gap.compressedEnd);
    expect(mapped.toRealMs(compressedMid)).toBeCloseTo(mid, 3);

    const after = MINUTE + idleMs + 10_000;
    expect(mapped.toCompressedMs(after)).toBeLessThan(after);
    expect(mapped.toRealMs(mapped.toCompressedMs(after))).toBeCloseTo(after, 3);

    const bandPx =
      ((gap.compressedEnd - gap.compressedStart) /
        mapped.compressedDurationMs) *
      width;
    expect(bandPx).toBeCloseTo(Math.min(SESSION_IDLE_BAND_PX, width / 2), 4);
  });
});
