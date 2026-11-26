import { describe, expect, it } from "vitest";
import { packCompactLanes } from "./compactLanes";
import { layout, prepareTimeline, type LayoutNode } from "./layout";
import { resolveDensity } from "./density";
import { createTextMeasurerFrom } from "./textMeasurer";

const measurer = createTextMeasurerFrom(null);

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

function lanesOf(roots: LayoutNode[]): number[] {
  const prepared = prepareTimeline(roots);
  return packCompactLanes(prepared.rows, prepared.originMs).lanes;
}

describe("packCompactLanes", () => {
  it("puts sequential traces and their observations on shared depth rows", () => {
    const roots = [
      span("trace-a", 0, 10, [span("a1", 1, 4, [span("a2", 2, 3)])]),
      span("trace-b", 10, 20, [span("b1", 12, 18)]),
    ];
    const prepared = prepareTimeline(roots);
    const packing = packCompactLanes(prepared.rows, prepared.originMs);

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
      density: resolveDensity({ pointer: "fine" }),
      measurer,
      view: null,
      compress: false,
      prepared,
      laneByRow: packing.lanes,
    });
    expect(positioned.rowCount).toBe(3);
    const y = (id: string) =>
      positioned.nodes.find((node) => node.id === id)!.y;
    expect(y("trace-a")).toBe(y("trace-b"));
    expect(y("a1")).toBeGreaterThan(y("trace-a"));
    expect(y("a2")).toBeGreaterThan(y("a1"));
  });

  it("gives overlapping traces and observations extra lanes", () => {
    const roots = [
      span("trace-a", 0, 100, [span("a1", 0, 50)]),
      span("trace-b", 40, 90, [span("b1", 40, 80)]),
    ];
    const prepared = prepareTimeline(roots);
    const packing = packCompactLanes(prepared.rows, prepared.originMs);
    const laneById = new Map(
      prepared.rows.map((row, index) => [row.node.id, packing.lanes[index]]),
    );

    expect(laneById.get("trace-a")).toBe(0);
    expect(laneById.get("trace-b")).toBe(1);
    expect(laneById.get("a1")).toBe(2);
    expect(laneById.get("b1")).toBe(3);
    expect(packing.laneCount).toBe(4);
    expect(lanesOf([span("only", 0, 5), span("next", 5, 9)])).toEqual([0, 0]);
  });

  it("does not stack two events that share an instant", () => {
    const roots = [
      span("left", 0, 5, [span("tick-a", 5, 5), span("tick-b", 5, 5)]),
    ];
    const prepared = prepareTimeline(roots);
    const packing = packCompactLanes(prepared.rows, prepared.originMs);
    const laneById = new Map(
      prepared.rows.map((row, index) => [row.node.id, packing.lanes[index]]),
    );
    expect(laneById.get("tick-a")).not.toBe(laneById.get("tick-b"));
  });
});
