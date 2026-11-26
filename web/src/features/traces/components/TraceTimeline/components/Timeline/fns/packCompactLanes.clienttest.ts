import { describe, expect, it } from "vitest";
import { packCompactLanes } from "./packCompactLanes";
import type { LayoutNode } from "../types";
import { layout } from "./layout";
import { prepareTimeline } from "./prepareTimeline";
import { createTextMeasurerFrom } from "./createTextMeasurerFrom";

const measurer = createTextMeasurerFrom(null);
const fineDensity = {
  pointer: "fine" as const,
  rowHeight: 26,
  barHeight: 16,
  labelFontPx: 12,
  labelPaddingPx: 4,
  labelGapPx: 6,
  minBarWidthPx: 4,
};

function span(
  id: string,
  startMs: number,
  endMs: number,
  children: LayoutNode[] = [],
): LayoutNode {
  return {
    id,
    name: id,
    type: id.startsWith("trace") ? "TRACE" : "SPAN",
    startTime: new Date(startMs),
    endTime: new Date(endMs),
    children,
  };
}

describe("packCompactLanes", () => {
  it("puts every depth on one row, including spans that overlap in time", () => {
    const roots = [
      span("trace-a", 0, 100, [span("a1", 0, 50, [span("a2", 10, 20)])]),
      span("trace-b", 40, 90, [span("b1", 40, 80)]),
    ];
    const prepared = prepareTimeline(roots);
    const packing = packCompactLanes(prepared.rows);

    expect(packing.laneCount).toBe(3);
    const laneById = new Map(
      prepared.rows.map((row, index) => [row.node.id, packing.lanes[index]]),
    );
    expect(laneById.get("trace-a")).toBe(0);
    expect(laneById.get("trace-b")).toBe(0);
    expect(laneById.get("a1")).toBe(1);
    expect(laneById.get("b1")).toBe(1);
    expect(laneById.get("a2")).toBe(2);

    const positioned = layout({
      roots,
      box: { width: 400, height: 200 },
      density: fineDensity,
      measurer,
      view: null,
      compress: false,
      prepared,
      laneByRow: packing.lanes,
      barInsetPx: 2,
    });
    expect(positioned.rowCount).toBe(3);
    const node = (id: string) =>
      positioned.nodes.find((item) => item.id === id)!;
    expect(node("trace-a").y).toBe(node("trace-b").y);
    expect(node("a1").y).toBeGreaterThan(node("trace-a").y);
    // Touching time edges still leave a pixel gap between the bars.
    const sequential = prepareTimeline([
      span("left", 0, 10),
      span("right", 10, 20),
    ]);
    const separated = layout({
      roots: sequential.rows.map((row) => row.node),
      box: { width: 400, height: 80 },
      density: fineDensity,
      measurer,
      view: null,
      compress: false,
      prepared: sequential,
      laneByRow: packCompactLanes(sequential.rows).lanes,
      barInsetPx: 2,
    });
    const leftBar = separated.nodes.find((item) => item.id === "left")!;
    const rightBar = separated.nodes.find((item) => item.id === "right")!;
    expect(leftBar.x + leftBar.width).toBeLessThan(rightBar.x);
  });

  it("leaves sub-pixel spans unmounted until the zoom gives them a pixel", () => {
    const tiny = Array.from({ length: 200 }, (_, index) =>
      span(`t${index}`, index * 10, index * 10 + 1),
    );
    const roots = [span("wide", 0, 30_000, tiny)];
    const prepared = prepareTimeline(roots);
    const laneByRow = packCompactLanes(prepared.rows).lanes;
    const fitted = layout({
      roots,
      box: { width: 300, height: 80 },
      density: fineDensity,
      measurer,
      view: null,
      compress: false,
      prepared,
      laneByRow,
    });
    expect(fitted.nodes.some((node) => node.id === "wide")).toBe(true);
    expect(fitted.nodes.length).toBeLessThan(prepared.rows.length);

    const zoomed = layout({
      roots,
      box: { width: 300, height: 80 },
      density: fineDensity,
      measurer,
      view: { start: 0, duration: 50 },
      compress: false,
      prepared,
      laneByRow,
    });
    expect(zoomed.nodes.some((node) => node.id.startsWith("t"))).toBe(true);
  });

  it("keeps an instantaneous span mounted in compact layout", () => {
    const event = span("event", 5, 5);
    const prepared = prepareTimeline([event]);
    const positioned = layout({
      roots: [event],
      box: { width: 300, height: 80 },
      density: fineDensity,
      measurer,
      view: null,
      compress: false,
      prepared,
      laneByRow: packCompactLanes(prepared.rows).lanes,
    });
    expect(positioned.nodes.map((node) => node.id)).toContain("event");
  });
});
