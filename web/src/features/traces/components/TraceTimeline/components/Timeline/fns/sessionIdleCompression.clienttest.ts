import { describe, expect, it } from "vitest";
import { IDLE_GAP_THRESHOLD_SECONDS } from "@/src/features/sessions/sessionIdleGap";
import type { LayoutNode } from "../types";
import { layout } from "./layout";
import { prepareTimeline } from "./prepareTimeline";
import { createTextMeasurerFrom } from "./createTextMeasurerFrom";
import { sessionIdleCompression } from "./sessionIdleCompression";

const MINUTE = 60_000;
const fineDensity = {
  pointer: "fine" as const,
  rowHeight: 26,
  barHeight: 16,
  labelFontPx: 12,
  labelPaddingPx: 4,
  labelGapPx: 6,
  minBarWidthPx: 4,
};

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
    const compression = sessionIdleCompression({
      rows: prepared.rows,
      originMs: prepared.originMs,
      durationMs: prepared.durationMs,
      physicalWidth: 1000,
    });
    expect(compression?.gaps).toHaveLength(1);
    expect(compression!.gaps[0]!.durationMs).toBe(
      IDLE_GAP_THRESHOLD_SECONDS * 1000,
    );
  });

  it("does not treat a running child as idle when the trace has no end", () => {
    const childEnd = 10 * MINUTE;
    const nextStart = childEnd + IDLE_GAP_THRESHOLD_SECONDS * 1000;
    const root: LayoutNode = {
      id: "a",
      name: "a",
      type: "TRACE",
      startTime: new Date(0),
      children: [
        {
          id: "child",
          name: "child",
          type: "GENERATION",
          startTime: new Date(0),
          endTime: new Date(childEnd),
          children: [],
        },
      ],
    };
    const prepared = prepareTimeline([
      root,
      trace("b", nextStart, nextStart + MINUTE),
    ]);
    const compression = sessionIdleCompression({
      rows: prepared.rows,
      originMs: prepared.originMs,
      durationMs: prepared.durationMs,
      physicalWidth: 1000,
      spans: prepared.spans,
    });
    const gap = compression?.gaps[0];
    expect(gap).toBeDefined();
    expect(gap!.start).toBeGreaterThanOrEqual(childEnd - 1);
    expect(compression!.toCompressedMs(childEnd / 2)).toBeLessThan(
      gap!.compressedStart,
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
    expect(bandPx).toBeCloseTo(72, 4);

    const positioned = layout({
      roots: [
        trace("before", 0, MINUTE),
        trace("after", MINUTE + idleMs, MINUTE + idleMs + MINUTE),
      ],
      box: { width, height: 120 },
      density: fineDensity,
      measurer: createTextMeasurerFrom(null),
      view: null,
      compress: false,
      prepared,
      compression: mapped,
    });
    const labels = positioned.ticks.map((tick) => tick.label);
    expect(
      labels.filter((label) => !label.includes("m")).length,
    ).toBeGreaterThan(1);
    expect(
      labels.filter((label) => label.includes("m")).length,
    ).toBeGreaterThan(1);

    const gapMarker = mapped.gaps[0]!;
    const zoomed = layout({
      roots: [
        trace("before", 0, MINUTE),
        trace("after", MINUTE + idleMs, MINUTE + idleMs + MINUTE),
      ],
      box: { width, height: 120 },
      density: fineDensity,
      measurer: createTextMeasurerFrom(null),
      view: {
        start: gapMarker.compressedEnd,
        duration: mapped.compressedDurationMs - gapMarker.compressedEnd,
      },
      compress: false,
      prepared,
      compression: mapped,
    });
    expect(zoomed.ticks.length).toBeGreaterThan(4);
    expect(zoomed.ticks[0]?.label).toContain("m");
  });
});
