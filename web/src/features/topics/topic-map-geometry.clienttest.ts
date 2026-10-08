import { describe, expect, it } from "vitest";
import { __test } from "./EmbeddingMapView";
import {
  baseScale,
  displayedPoint,
  displayedWorldPoint,
  fitCamera,
  hitPoint,
  panCamera,
  prepareMapLabels,
  prepareTopicMap,
  screenPoint,
  zoomCamera,
  type Camera,
  type MapData,
  type Size,
  type TopicMapModel,
} from "./map/prepare-topic-map";
import { createTopicMapStore } from "./map/topic-map-store";

const size = { width: 1000, height: 600 };
const bounds = { minX: -100, maxX: 100, minY: -50, maxY: 50 };
const camera = { x: 10, y: -5, zoom: 2 };
const pointer = { x: 0, y: 0 };
const topics = [
  {
    id: "billing",
    name: "Billing",
    description: "Invoice and payment requests.",
  },
  {
    id: "retrieval",
    name: "Retrieval",
    description: "Finding relevant context.",
  },
];

function point(
  traceId: string,
  x: number,
  y: number,
  overrides: Partial<MapData["points"][number]> = {},
): MapData["points"][number] {
  return {
    traceId,
    x,
    y,
    topicId: "billing",
    outcome: "assigned",
    summary: `Stored summary for ${traceId}`,
    ...overrides,
  };
}

function data(points: MapData["points"]): MapData {
  return { points, missingSummaryCount: 0, unpositionedCount: 0 };
}

function worldAtScreen(at: { x: number; y: number }, view: Camera, plot: Size) {
  const scale = baseScale(bounds, plot) * view.zoom;
  return {
    x: view.x + (at.x - plot.width / 2) / scale,
    y: view.y - (at.y - plot.height / 2) / scale,
  };
}

function traceLabelFixture(
  positions: { x: number; y: number }[],
  plot: Size,
  zoom = 3,
) {
  const prepared = prepareTopicMap(
    data([
      point("corner-a", -100, -100),
      point("corner-b", 100, -100),
      point("corner-c", -100, 100),
      point("corner-d", 100, 100),
      ...positions.map((_, i) => point(`label-${i}`, 0, 0)),
    ]),
    topics,
  );
  const view = {
    ...fitCamera(prepared.bounds, prepared.bounds, plot),
    zoom,
  };
  const scale = baseScale(prepared.bounds, plot) * view.zoom;
  const points = prepared.points.map((p) => {
    if (!p.traceId.startsWith("label-")) return p;
    const at = positions[Number(p.traceId.slice("label-".length))];
    return {
      ...p,
      x: view.x + (at.x - plot.width / 2) / scale,
      y: view.y - (at.y - plot.height / 2) / scale,
    };
  });
  // Isolate trace-card layout from the separately prepared topic-label layer.
  const model: TopicMapModel = {
    ...prepared,
    points,
    zones: [],
    pointById: new Map(points.map((p) => [p.traceId, p])),
  };
  return { model, view };
}

it("fits a tall cohort across the landscape plot while preserving pairwise distances", () => {
  const points = [
    [0, 0],
    [0, 10],
    [2, 20],
    [1, 30],
  ].map(([x, y], index) => ({
    traceId: `trace-${index}`,
    summary: `Summary ${index}`,
    topicId: null,
    outcome: "outlier" as const,
    x,
    y,
  }));
  const positions = __test.fitMapPoints(points, points, 960, 320);
  const spanX =
    Math.max(...positions.map((point) => point.x)) -
    Math.min(...positions.map((point) => point.x));
  const spanY =
    Math.max(...positions.map((point) => point.y)) -
    Math.min(...positions.map((point) => point.y));
  expect(spanX).toBeGreaterThan(spanY);
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const scale =
    distance(positions[0], positions[1]) / distance(points[0], points[1]);
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      expect(
        distance(positions[a], positions[b]) / distance(points[a], points[b]),
      ).toBeCloseTo(scale, 8);
    }
  }
});

describe("topic map camera", () => {
  it.each([
    { levels: 1.5, anchor: { x: 0.22, y: 0.73 } },
    { levels: -1, anchor: { x: 0.91, y: 0.08 } },
    { levels: 20, anchor: { x: 0.04, y: 0.96 } },
    { levels: -20, anchor: { x: 0.75, y: 0.25 } },
  ])(
    "keeps the world point under a zoom anchor fixed ($levels levels)",
    ({ levels, anchor }) => {
      const at = { x: anchor.x * size.width, y: anchor.y * size.height };
      const world = worldAtScreen(at, camera, size);
      const zoomed = zoomCamera(camera, levels, anchor, bounds, size);
      const after = screenPoint(world, zoomed, bounds, size);

      expect(after.x).toBeCloseTo(at.x, 8);
      expect(after.y).toBeCloseTo(at.y, 8);
      expect(Number.isFinite(zoomed.zoom)).toBe(true);
      expect(zoomed.zoom).toBeGreaterThan(0);
    },
  );

  it("moves content by the gesture's pixel delta at any zoom", () => {
    const world = { x: 30, y: 15 };
    for (const zoom of [0.5, 1, 12]) {
      const beforeCamera = { ...camera, zoom };
      const before = screenPoint(world, beforeCamera, bounds, size);
      const afterCamera = panCamera(beforeCamera, 83, -37, bounds, size);
      const after = screenPoint(world, afterCamera, bounds, size);

      expect(after.x - before.x).toBeCloseTo(83, 8);
      expect(after.y - before.y).toBeCloseTo(-37, 8);
      expect(afterCamera.zoom).toBe(zoom);
    }
  });

  it.each([
    { width: 1200, height: 400 },
    { width: 400, height: 900 },
  ])(
    "fits a selected zone into $width by $height without stretching distances",
    (plot) => {
      const selectedBounds = { minX: -20, maxX: 10, minY: -15, maxY: 5 };
      const view = fitCamera(selectedBounds, bounds, plot);
      const corners = [
        { x: selectedBounds.minX, y: selectedBounds.minY },
        { x: selectedBounds.maxX, y: selectedBounds.maxY },
      ];
      const projected = corners.map((p) => screenPoint(p, view, bounds, plot));

      for (const p of projected) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(plot.width);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(plot.height);
      }
      const horizontal = screenPoint({ x: 1, y: 0 }, view, bounds, plot);
      const vertical = screenPoint({ x: 0, y: 1 }, view, bounds, plot);
      const origin = screenPoint({ x: 0, y: 0 }, view, bounds, plot);
      expect(horizontal.x - origin.x).toBeCloseTo(origin.y - vertical.y, 8);
      const center = screenPoint(
        {
          x: (selectedBounds.minX + selectedBounds.maxX) / 2,
          y: (selectedBounds.minY + selectedBounds.maxY) / 2,
        },
        view,
        bounds,
        plot,
      );
      expect(center).toEqual({ x: plot.width / 2, y: plot.height / 2 });
    },
  );

  it("keeps empty and coincident maps navigable with finite coordinates", () => {
    for (const points of [[], [point("one", 0, 0), point("two", 0, 0)]]) {
      const model = prepareTopicMap(data(points), topics);
      const fitted = fitCamera(model.bounds, model.bounds, size);
      const moved = panCamera(fitted, 50, -50, model.bounds, size);
      const zoomed = zoomCamera(
        moved,
        1,
        { x: 0.25, y: 0.75 },
        model.bounds,
        size,
      );
      for (const value of Object.values(zoomed))
        expect(Number.isFinite(value)).toBe(true);
      for (const p of model.points) {
        const position = screenPoint(p, zoomed, model.bounds, size);
        expect(Number.isFinite(position.x)).toBe(true);
        expect(Number.isFinite(position.y)).toBe(true);
      }
    }
  });
});

describe("topic map preparation", () => {
  it("does not use individual trace text as missing historical topic context", () => {
    const trace = point("historical-trace", 0, 0);
    for (const description of [undefined, "", "   "]) {
      const model = prepareTopicMap(data([trace]), [
        { id: "billing", name: "Billing", description },
      ]);
      expect(model.zones[0].description).not.toBe(trace.summary);
      expect(model.zones[0].description).toMatch(
        /description.*(available|saved)/i,
      );
    }
  });

  it("groups the discovery cohort separately from outliers and unavailable assignments", () => {
    const model = prepareTopicMap(
      data([
        point("invoice", -5, -1),
        point("refund", -4, 2),
        point("context", 6, 1, { topicId: "retrieval" }),
        point("new-request", 0, 8, { topicId: null, outcome: "outlier" }),
        point("stale-assignment", 0, -8, {
          topicId: null,
          outcome: "unassigned",
        }),
      ]),
      topics,
    );
    const zones = new Map(model.zones.map((zone) => [zone.id, zone]));

    expect(zones.get("billing")?.points.map((p) => p.traceId)).toEqual([
      "invoice",
      "refund",
    ]);
    expect(zones.get("retrieval")?.points).toHaveLength(1);
    expect(zones.get("outliers")?.points[0].outcome).toBe("outlier");
    expect(zones.get("awaiting_map")?.points[0].outcome).toBe("unassigned");
    expect(zones.get("billing")?.description).toBe(topics[0].description);
    expect(
      model.zones.reduce((count, zone) => count + zone.points.length, 0),
    ).toBe(model.points.length);
    expect(
      new Set(model.zones.flatMap((zone) => zone.points.map((p) => p.traceId)))
        .size,
    ).toBe(model.points.length);
    for (const zone of model.zones) {
      expect(zone.x).toBeGreaterThanOrEqual(zone.bounds.minX);
      expect(zone.x).toBeLessThanOrEqual(zone.bounds.maxX);
      expect(zone.y).toBeGreaterThanOrEqual(zone.bounds.minY);
      expect(zone.y).toBeLessThanOrEqual(zone.bounds.maxY);
    }
  });

  it("keeps depth attached to trace identity across data and topic ordering", () => {
    const input = data([
      point("invoice", -8, -4),
      point("refund", 0, 3),
      point("context", 9, 1, { topicId: "retrieval" }),
    ]);
    const before = structuredClone(input);
    const first = prepareTopicMap(input, topics);
    const reordered = prepareTopicMap(
      data([...input.points].reverse()),
      [...topics].reverse(),
    );

    for (const p of first.points) {
      expect(p.depth).toBe(reordered.pointById.get(p.traceId)?.depth);
      expect(p.gridIndex).toBe(reordered.pointById.get(p.traceId)?.gridIndex);
      expect(p.gridCount).toBe(reordered.pointById.get(p.traceId)?.gridCount);
      expect(p.depth).toBeGreaterThanOrEqual(0);
      expect(p.depth).toBeLessThan(1);
    }
    expect(new Set(first.points.map((p) => p.depth)).size).toBeGreaterThan(1);
    expect(input).toEqual(before);
  });

  it("retains every point and its coordinates while entering a zone and selecting a trace", () => {
    const model = prepareTopicMap(
      data([
        point("invoice", -10, -3),
        point("refund", -8, 3),
        point("context", 10, 0, { topicId: "retrieval" }),
      ]),
      topics,
    );
    const before = model.points.map((p) => ({
      traceId: p.traceId,
      x: p.x,
      y: p.y,
      depth: p.depth,
    }));
    const store = createTopicMapStore();
    const zone = model.zones.find((item) => item.id === "billing")!;
    const focusedCamera = fitCamera(zone.bounds, model.bounds, size);
    store.setState({
      scope: zone.id,
      camera: focusedCamera,
      hoveredId: "invoice",
    });
    prepareMapLabels(model, store.getState().camera!, size, pointer, "invoice");
    hitPoint(
      model,
      focusedCamera,
      size,
      pointer,
      screenPoint(zone.points[0], focusedCamera, model.bounds, size),
    );

    expect(
      model.points.map((p) => ({
        traceId: p.traceId,
        x: p.x,
        y: p.y,
        depth: p.depth,
      })),
    ).toEqual(before);
    expect(model.pointById.has("context")).toBe(true);
    expect(model.pointById.size).toBe(3);
    expect(store.getState().scope).toBe("billing");
  });

  it("keeps camera and hover interactions local to each explorer instance", () => {
    const first = createTopicMapStore();
    const second = createTopicMapStore();
    const untouched = second.getState();
    first.setState({
      scope: "billing",
      camera,
      pointer: { x: 1, y: -1 },
      hoveredId: "invoice",
      isFullscreen: true,
    });

    expect(second.getState()).toBe(untouched);
    expect(second.getState().camera).toBeNull();
    expect(second.getState().hoveredId).toBeNull();
    expect(second.getState().pointer).toEqual(pointer);
    expect(second.getState().isFullscreen).toBe(false);
  });

  it("hit-tests the visible parallax position and chooses the nearest trace", () => {
    const model = prepareTopicMap(
      data(
        Array.from({ length: 20 }, (_, i) => point(`trace-${i}`, i * 10, 0)),
      ),
      topics,
    );
    const selected = [...model.points].sort((a, b) => b.depth - a.depth)[0];
    const view = fitCamera(model.bounds, model.bounds, size);
    const movingPointer = { x: 1, y: 0 };
    const visible = displayedPoint(
      selected,
      view,
      model.bounds,
      size,
      movingPointer,
    );
    const at = { x: visible.x + 10, y: visible.y };

    expect(hitPoint(model, view, size, movingPointer, at)?.traceId).toBe(
      selected.traceId,
    );
    expect(hitPoint(model, view, size, pointer, at)).toBeNull();
    expect(
      hitPoint(model, view, size, movingPointer, { x: -100, y: -100 }),
    ).toBeNull();
  });

  it("morphs into a stable responsive reading grid without changing saved coordinates", () => {
    const model = prepareTopicMap(
      data(
        Array.from({ length: 12 }, (_, i) =>
          point(`trace-${String(i).padStart(2, "0")}`, i * 2, i % 3),
        ),
      ),
      topics,
    );
    const canonical = model.points.map((p) => ({ x: p.x, y: p.y }));
    const plot = { width: 1200, height: 1000 };
    const zone = model.zones[0];
    const view = { x: zone.x, y: zone.y, zoom: 10 };
    const positions = model.points.map((p) =>
      displayedPoint(p, view, model.bounds, plot, pointer),
    );

    // Four columns become one on a narrow viewport, preserving the trace order.
    expect(positions[1].y).toBeCloseTo(positions[0].y, 8);
    expect(positions[1].x - positions[0].x).toBeGreaterThan(250);
    expect(positions[4].x).toBeCloseTo(positions[0].x, 8);
    expect(positions[4].y - positions[0].y).toBeGreaterThan(140);
    const mobile = { width: 360, height: 800 };
    const narrow = model.points.map((p) =>
      displayedPoint(p, view, model.bounds, mobile, pointer),
    );
    expect(narrow[1].x).toBeCloseTo(narrow[0].x, 8);
    expect(narrow[1].y).toBeGreaterThan(narrow[0].y);
    for (const zoom of [10, 20, 32]) {
      const a = displayedPoint(
        model.points[0],
        { ...view, zoom },
        model.bounds,
        plot,
        pointer,
      );
      const b = displayedPoint(
        model.points[1],
        { ...view, zoom },
        model.bounds,
        plot,
        pointer,
      );
      expect(b.x - a.x).toBeCloseTo(
        ((positions[1].x - positions[0].x) * zoom) / 10,
        8,
      );
    }
    expect(model.points.map((p) => ({ x: p.x, y: p.y }))).toEqual(canonical);
  });

  it("shares the displayed position between focus, cards, hit testing, and fading parallax", () => {
    const model = prepareTopicMap(
      data(
        Array.from({ length: 6 }, (_, i) => point(`trace-${i}`, i * 5, i % 2)),
      ),
      topics,
    );
    const selected = model.points[3];
    for (const zoom of [3, 6.5, 10, 20]) {
      const world = displayedWorldPoint(selected, zoom, model.bounds, size);
      const view = { ...world, zoom };
      const shown = displayedPoint(selected, view, model.bounds, size, pointer);
      expect(shown.x).toBeCloseTo(size.width / 2, 8);
      expect(shown.y).toBeCloseTo(size.height / 2, 8);
      expect(hitPoint(model, view, size, pointer, shown)?.traceId).toBe(
        selected.traceId,
      );
      const label = prepareMapLabels(
        model,
        view,
        size,
        pointer,
        null,
        null,
        selected.traceId,
      ).traces[0];
      expect(label.point.traceId).toBe(selected.traceId);
      expect(label.position).toEqual(shown);
      if (zoom >= 10) {
        expect(
          displayedPoint(selected, view, model.bounds, size, { x: 1, y: -1 }),
        ).toEqual(shown);
      }
    }
    const cloud = displayedWorldPoint(selected, 3, model.bounds, size);
    expect(cloud).toEqual({ x: selected.x, y: selected.y });
    const before = displayedWorldPoint(selected, 3 - 0.001, model.bounds, size);
    const after = displayedWorldPoint(selected, 3 + 0.001, model.bounds, size);
    expect(Math.hypot(before.x - after.x, before.y - after.y)).toBeLessThan(
      0.01,
    );
  });

  it("keeps a reading-grid trace under the cursor when continuing to zoom", () => {
    const model = prepareTopicMap(
      data(
        Array.from({ length: 8 }, (_, i) => point(`trace-${i}`, i * 3, i % 2)),
      ),
      topics,
    );
    const view = { ...fitCamera(model.bounds, model.bounds, size), zoom: 10 };
    const readingPoint = model.points[3];
    const at = displayedPoint(readingPoint, view, model.bounds, size, pointer);
    const anchor = { x: at.x / size.width, y: at.y / size.height };
    const zoomed = zoomCamera(view, 1, anchor, model.bounds, size);
    const after = displayedPoint(
      readingPoint,
      zoomed,
      model.bounds,
      size,
      pointer,
    );
    expect(after.x).toBeCloseTo(at.x, 8);
    expect(after.y).toBeCloseTo(at.y, 8);
    expect(displayedWorldPoint(readingPoint, 20, model.bounds, size)).toEqual(
      displayedWorldPoint(readingPoint, 10, model.bounds, size),
    );
  });

  it("keeps surrounding topics in the cloud while reading a selected zone", () => {
    const model = prepareTopicMap(
      data([
        point("foreign-trace", 0, 0, { topicId: "retrieval" }),
        point("corner-a", -100, -100),
        point("corner-b", 100, -100),
        point("corner-c", -100, 100),
        point("corner-d", 100, 100),
        point("billing-trace", 0, 0),
      ]),
      topics,
    );
    const foreign = model.pointById.get("foreign-trace")!;
    const billing = model.pointById.get("billing-trace")!;
    const view = { ...fitCamera(model.bounds, model.bounds, size), zoom: 10 };
    expect(
      displayedWorldPoint(foreign, 10, model.bounds, size, "billing"),
    ).toEqual({ x: foreign.x, y: foreign.y });
    expect(
      displayedWorldPoint(billing, 10, model.bounds, size, "billing"),
    ).not.toEqual({ x: billing.x, y: billing.y });
    const automatic = prepareMapLabels(
      model,
      view,
      size,
      pointer,
      null,
      null,
      null,
      "billing",
    ).traces;
    expect(automatic.length).toBeGreaterThan(0);
    expect(automatic.every((label) => label.point.groupId === "billing")).toBe(
      true,
    );
    const hovered = prepareMapLabels(
      model,
      view,
      size,
      pointer,
      "billing-trace",
      null,
      "foreign-trace",
      "billing",
    ).traces;
    expect(hovered[0].point.traceId).toBe("foreign-trace");
    const position = displayedPoint(
      foreign,
      view,
      model.bounds,
      size,
      pointer,
      "billing",
    );
    expect(hovered[0].position).toEqual(position);
    expect(
      hitPoint(model, view, size, pointer, position, "billing")?.traceId,
    ).toBe("foreign-trace");
    const selected = prepareMapLabels(
      model,
      view,
      size,
      pointer,
      "foreign-trace",
      null,
      null,
      "billing",
    ).traces;
    expect(selected[0].point.traceId).toBe("foreign-trace");
  });
});

describe("topic map level of detail", () => {
  it.each([
    { edge: "left", x: 2, y: 250 },
    { edge: "right", x: 358, y: 250 },
    { edge: "top", x: 180, y: 2 },
    { edge: "bottom", x: 180, y: 498 },
    { edge: "clipped left", x: -4, y: 250 },
    { edge: "clipped bottom", x: 180, y: 504 },
    { edge: "top-left corner", x: 2, y: 2 },
    { edge: "bottom-right corner", x: 358, y: 498 },
  ])(
    "keeps a hovered trace card inside the stage near the $edge",
    ({ x, y }) => {
      const plot = { width: 360, height: 500 };
      const { model, view } = traceLabelFixture([{ x, y }], plot);
      const labels = prepareMapLabels(
        model,
        view,
        plot,
        pointer,
        null,
        null,
        "label-0",
      ).traces;
      expect(labels).toHaveLength(1);
      const { card, position } = labels[0];
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(plot.width);
      expect(card.y + card.height).toBeLessThanOrEqual(plot.height);
      const dx = Math.max(
        card.x - position.x,
        0,
        position.x - card.x - card.width,
      );
      const dy = Math.max(
        card.y - position.y,
        0,
        position.y - card.y - card.height,
      );
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(11.99);
    },
  );

  it("gives the hovered trace the first card ahead of a distinct selection", () => {
    const { model, view } = traceLabelFixture(
      [
        { x: 200, y: 150 },
        { x: 205, y: 155 },
        { x: 210, y: 160 },
      ],
      size,
    );
    const labels = prepareMapLabels(
      model,
      view,
      size,
      pointer,
      "label-0",
      null,
      "label-2",
    ).traces;

    expect(labels[0].point.traceId).toBe("label-2");
    expect(labels[1].point.traceId).toBe("label-0");
  });

  it("keeps a hover card available in a crowded overview while preserving its own dot", () => {
    const positions = Array.from({ length: 1410 }, (_, i) => ({
      x: 30 + (i % 47) * 20,
      y: 30 + Math.floor(i / 47) * 18,
    }));
    const { model, view } = traceLabelFixture(positions, size, 1);
    const hoveredId = "label-705";
    const labels = prepareMapLabels(
      model,
      view,
      size,
      pointer,
      null,
      null,
      hoveredId,
    );
    const hovered = labels.traces[0];
    expect(hovered.point.traceId).toBe(hoveredId);
    expect(labels.traces).toHaveLength(1);
    const dot = displayedPoint(
      hovered.point,
      view,
      model.bounds,
      size,
      pointer,
    );
    expect(
      dot.x < hovered.card.x ||
        dot.x > hovered.card.x + hovered.card.width ||
        dot.y < hovered.card.y ||
        dot.y > hovered.card.y + hovered.card.height,
    ).toBe(true);
    expect(
      model.points.some((p) => {
        if (p.traceId === hoveredId) return false;
        const other = displayedPoint(p, view, model.bounds, size, pointer);
        return (
          other.x > hovered.card.x &&
          other.x < hovered.card.x + hovered.card.width &&
          other.y > hovered.card.y &&
          other.y < hovered.card.y + hovered.card.height
        );
      }),
    ).toBe(true);
  });

  it("does not show a zone hover card beside an overview trace hover card", () => {
    const model = prepareTopicMap(data([point("trace", 0, 0)]), topics);
    const view = fitCamera(model.bounds, model.bounds, size);
    const labels = prepareMapLabels(
      model,
      view,
      size,
      pointer,
      null,
      "billing",
      "trace",
    );
    expect(labels.traces).toHaveLength(1);
    expect(labels.zones).toHaveLength(0);
  });

  it("shows the diagnostic sentence in a close reading card", () => {
    const summary =
      "The assistant used the retrieve_order tool to inspect the shipment status and confirm the customer request. It then checked the fulfillment record and attempted a tracking lookup. The carrier timed out after three attempts, leaving the delivery estimate unresolved.";
    const model = prepareTopicMap(
      data([point("timeout", 0, 0, { summary })]),
      topics,
    );
    const selected = model.points[0];
    const world = displayedWorldPoint(selected, 10, model.bounds, size);
    const labels = prepareMapLabels(
      model,
      { ...world, zoom: 10 },
      size,
      pointer,
      null,
      null,
      selected.traceId,
    );
    expect(labels.traces[0].excerpt).toBe(summary);
    expect(labels.traces[0].reading).toBe(true);
    expect(labels.traces[0].card.width).toBeGreaterThan(240);
    expect(labels.traces[0].card.height).toBeGreaterThan(130);
  });

  it("keeps automatic summary cards clear of every visible trace dot", () => {
    const { model, view } = traceLabelFixture(
      [
        { x: 200, y: 150 },
        { x: 270, y: 180 },
        { x: 600, y: 400 },
      ],
      size,
    );
    const labels = prepareMapLabels(model, view, size, pointer, null).traces;

    expect(labels.length).toBeGreaterThan(0);
    for (const { card } of labels) {
      for (const point of model.points) {
        const dot = displayedPoint(point, view, model.bounds, size, pointer);
        const coversDot =
          dot.x > card.x - 7 &&
          dot.x < card.x + card.width + 7 &&
          dot.y > card.y - 7 &&
          dot.y < card.y + card.height + 7;
        expect(coversDot).toBe(false);
      }
    }
  });

  it("keeps automatic zone context clear of trace dots", () => {
    const { model, view } = traceLabelFixture(
      [
        { x: 480, y: 280 },
        { x: 500, y: 300 },
        { x: 520, y: 320 },
        { x: 550, y: 300 },
      ],
      size,
      2,
    );
    const members = model.points.filter((p) => p.traceId.startsWith("label-"));
    model.zones = [
      {
        id: "billing",
        name: "Billing",
        description: topics[0].description,
        color: members[0].color,
        points: members,
        bounds: {
          minX: Math.min(...members.map((p) => p.x)),
          maxX: Math.max(...members.map((p) => p.x)),
          minY: Math.min(...members.map((p) => p.y)),
          maxY: Math.max(...members.map((p) => p.y)),
        },
        x: members.reduce((sum, p) => sum + p.x, 0) / members.length,
        y: members.reduce((sum, p) => sum + p.y, 0) / members.length,
        countLabel: `${members.length} mapped traces`,
        shareLabel: "100% of map",
      },
    ];
    const labels = prepareMapLabels(model, view, size, pointer, null);
    expect(labels.zones).toHaveLength(1);
    expect(labels.traces).toHaveLength(0);
    const card = labels.zones[0].label;
    for (const point of members) {
      const dot = displayedPoint(point, view, model.bounds, size, pointer);
      expect(
        dot.x > card.x - 7 &&
          dot.x < card.x + card.width + 7 &&
          dot.y > card.y - 7 &&
          dot.y < card.y + card.height + 7,
      ).toBe(false);
    }
  });

  it("avoids overlapping summary cards across neighboring density cells", () => {
    const { model, view } = traceLabelFixture(
      [
        { x: 239, y: 150 },
        { x: 241, y: 150 },
        { x: 600, y: 400 },
      ],
      size,
    );
    const labels = prepareMapLabels(model, view, size, pointer, null).traces;

    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((label) => label.point.traceId === "label-2")).toBe(
      true,
    );
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i].card;
        const b = labels[j].card;
        const overlap =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlap).toBe(false);
      }
    }
  });

  it("keeps a selected trace's inline summary visible on a narrow viewport", () => {
    const plot = { width: 360, height: 500 };
    const { model, view } = traceLabelFixture(
      [
        { x: 180, y: 250 },
        { x: 338, y: 450 },
      ],
      plot,
    );
    const labels = prepareMapLabels(
      model,
      view,
      plot,
      pointer,
      "label-1",
    ).traces;

    expect(labels[0].point.traceId).toBe("label-1");
    expect(labels.some((label) => label.point.traceId === "label-0")).toBe(
      true,
    );
    for (const { card } of labels) {
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(plot.width);
      expect(card.y + card.height).toBeLessThanOrEqual(plot.height);
    }
  });

  it("reveals zone context before trace summaries and prioritizes the selected trace in a dense cloud", () => {
    const model = prepareTopicMap(
      data(Array.from({ length: 40 }, (_, i) => point(`trace-${i}`, 0, 0))),
      topics,
    );
    const overview = fitCamera(model.bounds, model.bounds, size);
    const close = { ...overview, zoom: 4 };

    const overviewLabels = prepareMapLabels(
      model,
      overview,
      size,
      pointer,
      null,
    );
    expect(overviewLabels.traces).toHaveLength(0);
    expect(overviewLabels.zones).toHaveLength(0);
    expect(
      prepareMapLabels(model, overview, size, pointer, null, "billing").zones[0]
        .detail,
    ).toBeNull();
    const zoneLabels = prepareMapLabels(
      model,
      { ...overview, zoom: 2 },
      size,
      pointer,
      null,
    );
    expect(zoneLabels.traces).toHaveLength(0);
    expect(zoneLabels.zones[0].detail).toBe(topics[0].description);
    const labels = prepareMapLabels(
      model,
      close,
      size,
      pointer,
      "trace-39",
    ).traces;
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0].point.traceId).toBe("trace-39");
    expect(labels[0].excerpt).toBe(model.pointById.get("trace-39")?.summary);
  });

  it("bounds label work for large cohorts while preserving the full map population", () => {
    const points = Array.from({ length: 2500 }, (_, i) =>
      point(`trace-${i}`, i % 50, Math.floor(i / 50)),
    );
    const model = prepareTopicMap(data(points), topics);
    const plot = { width: 4000, height: 2500 };
    for (const zoom of [3, 10]) {
      const view = { ...fitCamera(model.bounds, model.bounds, plot), zoom };
      const labels = prepareMapLabels(model, view, plot, pointer, null).traces;

      expect(labels.length).toBeGreaterThan(0);
      expect(labels.length).toBeLessThanOrEqual(64);
      expect(new Set(labels.map((label) => label.point.traceId)).size).toBe(
        labels.length,
      );
      expect(model.points).toHaveLength(2500);
      for (const label of labels)
        expect(label.point.summary).toContain(label.excerpt);
    }
  });
});
