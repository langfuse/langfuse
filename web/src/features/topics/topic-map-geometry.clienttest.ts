import { describe, expect, it } from "vitest";
import { __test } from "./EmbeddingMapView";
import {
  baseScale,
  displayedNodeWorldPoint,
  fitCamera,
  hitMapNode,
  panCamera,
  prepareMapHover,
  prepareMapNodes,
  prepareNodeLayout,
  prepareTopicMap,
  screenPoint,
  zoomCamera,
  type Camera,
  type MapData,
  type Size,
  type TopicMapModel,
  type TopicMapNodeFrame,
} from "./map/prepare-topic-map";
import {
  createTopicMapStore,
  finishTopicMapHover,
  getTopicMapHover,
  publishTopicMapFrame,
  setTopicMapHover,
} from "./map/topic-map-store";

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

function frameFor(
  model: TopicMapModel,
  zoom: number,
  plot = size,
  readingTopic: string | null = null,
  movingPointer = pointer,
) {
  return prepareMapNodes(
    model,
    prepareNodeLayout(model, plot),
    { ...fitCamera(model.bounds, model.bounds, plot), zoom },
    plot,
    movingPointer,
    readingTopic,
  );
}
function frameAt(
  positions: { x: number; y: number }[],
  plot = size,
  zoom = 10,
): TopicMapNodeFrame {
  const model = prepareTopicMap(
    data(positions.map((_, i) => point(`trace-${i}`, 0, 0))),
    topics,
  );
  const view = { x: 0, y: 0, zoom };
  const scale = baseScale(model.bounds, plot) * zoom;
  const worldPositions = new Map(
    model.points.map((p, i) => [
      p.traceId,
      {
        x: (positions[i].x - plot.width / 2) / scale,
        y: -(positions[i].y - plot.height / 2) / scale,
      },
    ]),
  );
  return prepareMapNodes(
    model,
    prepareNodeLayout(model, plot),
    view,
    plot,
    pointer,
    null,
    worldPositions,
  );
}
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
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
      expect(p.depth).toBeGreaterThanOrEqual(0);
      expect(p.depth).toBeLessThan(1);
    }
    expect(new Set(first.points.map((p) => p.depth)).size).toBeGreaterThan(1);
    expect(input).toEqual(before);
  });

  it("preserves canonical points and keeps interaction state local while preparing nodes", () => {
    const model = prepareTopicMap(
      data([
        point("invoice", -10, -3),
        point("refund", -8, 3),
        point("context", 10, 0, { topicId: "retrieval" }),
      ]),
      topics,
    );
    const before = structuredClone(model.points);
    const first = createTopicMapStore();
    const second = createTopicMapStore();
    const untouched = second.getState();
    first.setState({
      scope: "billing",
      camera,
      hoveredId: "invoice",
      pointer: { x: 1, y: 1 },
      isFullscreen: true,
    });
    const frame = frameFor(model, 10, size, "billing");
    prepareMapHover(frame, "invoice", "billing");
    expect(model.points).toEqual(before);
    expect(frame.nodeById.size).toBe(3);
    expect(frame.nodeById.has("context")).toBe(true);
    expect(second.getState()).toBe(untouched);
  });
});
describe("topic map node layout", () => {
  it("orders cells by spatial rows instead of trace identifiers and supports a mobile column", () => {
    const input = data([
      point("z-top-left", -1, 1),
      point("a-top-right", 1, 1),
      point("y-bottom-left", -1, -1),
      point("b-bottom-right", 1, -1),
    ]);
    const model = prepareTopicMap(input, topics);
    const plot = { width: 650, height: 600 };
    const layout = prepareNodeLayout(model, plot);
    const target = (id: string) => layout.worldTargets.get(id)!;
    expect(target("z-top-left").x).toBeLessThan(target("a-top-right").x);
    expect(target("z-top-left").y).toBeGreaterThan(target("y-bottom-left").y);
    expect(target("y-bottom-left").x).toBeLessThan(target("b-bottom-right").x);
    const reordered = prepareNodeLayout(
      prepareTopicMap(data([...input.points].reverse()), topics),
      plot,
    );
    expect([...layout.worldTargets].sort()).toEqual(
      [...reordered.worldTargets].sort(),
    );
    const narrow = prepareNodeLayout(model, { width: 360, height: 600 });
    expect(
      new Set([...narrow.worldTargets.values()].map((p) => p.x)).size,
    ).toBe(1);
    expect(
      new Set([...narrow.worldTargets.values()].map((p) => p.y)).size,
    ).toBe(4);
  });
  it("preserves cloud positions before reading and freezes world targets after it completes", () => {
    const model = prepareTopicMap(
      data([point("one", 0, 0), point("two", 10, 4)]),
      topics,
    );
    const layout = prepareNodeLayout(model, size);
    for (const p of model.points) {
      expect(displayedNodeWorldPoint(p, 3, layout)).toEqual({ x: p.x, y: p.y });
      expect(displayedNodeWorldPoint(p, 10, layout)).toEqual(
        displayedNodeWorldPoint(p, 20, layout),
      );
      expect(displayedNodeWorldPoint(p, 10, layout)).toEqual(
        layout.worldTargets.get(p.traceId),
      );
    }
  });
  it("keeps surrounding topics in their cloud when a selected zone opens", () => {
    const model = prepareTopicMap(
      data([
        point("billing", -5, 0),
        point("foreign", 5, 0, { topicId: "retrieval" }),
      ]),
      topics,
    );
    const layout = prepareNodeLayout(model, size);
    const foreign = model.pointById.get("foreign")!;
    expect(displayedNodeWorldPoint(foreign, 10, layout, "billing")).toEqual({
      x: foreign.x,
      y: foreign.y,
    });
    const frame = frameFor(model, 10, size, "billing");
    expect(frame.nodeById.get("foreign")?.expansion).toBe(0);
    expect(frame.nodeById.get("foreign")?.textOpacity).toBe(0);
    expect(frame.nodeById.size).toBe(2);
  });
  it("keeps a reading node under the cursor during further zoom", () => {
    const model = prepareTopicMap(
      data(
        Array.from({ length: 8 }, (_, i) => point(`trace-${i}`, i * 3, i % 2)),
      ),
      topics,
    );
    const layout = prepareNodeLayout(model, size);
    const view = { ...fitCamera(model.bounds, model.bounds, size), zoom: 10 };
    const p = model.points[3];
    const before = prepareMapNodes(
      model,
      layout,
      view,
      size,
      pointer,
    ).nodeById.get(p.traceId)!;
    const zoomed = zoomCamera(
      view,
      1,
      { x: before.center.x / size.width, y: before.center.y / size.height },
      model.bounds,
      size,
    );
    const after = prepareMapNodes(
      model,
      layout,
      zoomed,
      size,
      pointer,
    ).nodeById.get(p.traceId)!;
    expect(after.center.x).toBeCloseTo(before.center.x, 8);
    expect(after.center.y).toBeCloseTo(before.center.y, 8);
  });
});
describe("continuous trace nodes", () => {
  it("grows overview dots during zoom before reading rectangles open", () => {
    const model = prepareTopicMap(data([point("trace", 0, 0)]), topics);
    const dots = [1, 2, 3].map((zoom) => frameFor(model, zoom).nodes[0]);
    expect(dots[1].rect.width).toBeGreaterThan(dots[0].rect.width);
    expect(dots[2].rect.width).toBeGreaterThan(dots[1].rect.width);
    for (const dot of dots) {
      expect(dot.rect.width).toBe(dot.rect.height);
      expect(dot.expansion).toBe(0);
      expect(dot.textOpacity).toBe(0);
    }
  });

  it("keeps readable content centered on the trace that grows into it", () => {
    const model = prepareTopicMap(data([point("trace", 0, 0)]), topics);
    let previousWidth = 0;
    for (const zoom of [1, 3, 4, 6, 8, 10, 20]) {
      const node = frameFor(model, zoom).nodes[0];
      expect(node.rect.x + node.rect.width / 2).toBeCloseTo(node.center.x, 8);
      expect(node.rect.y + node.rect.height / 2).toBeCloseTo(node.center.y, 8);
      expect(node.rect.width).toBeGreaterThanOrEqual(previousWidth - 0.01);
      expect(node.excerpt).toBe(model.points[0].summary);
      previousWidth = node.rect.width;
    }
  });
  it("opens a surface and icon before text using the actual available footprint", () => {
    const model = prepareTopicMap(data([point("trace", 0, 0)]), topics);
    const early = frameFor(model, 4).nodes[0];
    const icon = frameFor(model, 6).nodes[0];
    const reading = frameFor(model, 10).nodes[0];
    expect(early.backgroundOpacity).toBeGreaterThan(0);
    expect(early.strokeOpacity).toBeGreaterThan(0);
    expect(early.textOpacity).toBe(0);
    expect(icon.iconOpacity).toBeGreaterThan(0.9);
    expect(icon.textOpacity).toBeLessThan(icon.iconOpacity);
    expect(reading.textOpacity).toBe(1);
    expect(
      frameAt([
        { x: 400, y: 300 },
        { x: 440, y: 300 },
      ]).nodes.every((node) => node.textOpacity === 0),
    ).toBe(true);
  });
  it.each([3, 10])(
    "changes positions and footprints continuously across zoom %s",
    (zoom) => {
      const model = prepareTopicMap(
        data([point("a", -2, 1), point("b", 2, -1)]),
        topics,
      );
      const before = frameFor(model, zoom - 0.0001);
      const after = frameFor(model, zoom + 0.0001);
      for (const p of model.points) {
        const a = before.nodeById.get(p.traceId)!;
        const b = after.nodeById.get(p.traceId)!;
        expect(
          Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y),
        ).toBeLessThan(0.1);
        expect(Math.abs(a.rect.width - b.rect.width)).toBeLessThan(0.1);
        expect(Math.abs(a.rect.height - b.rect.height)).toBeLessThan(0.1);
      }
    },
  );
  it("limits growth so rectangles do not cover neighboring nodes", () => {
    const frame = frameAt([
      { x: 300, y: 250 },
      { x: 440, y: 250 },
      { x: 590, y: 300 },
    ]);
    expect(
      frame.nodes.every((node) => node.expansion > 0 && node.expansion < 1),
    ).toBe(true);
    for (let i = 0; i < frame.nodes.length; i++)
      for (let j = i + 1; j < frame.nodes.length; j++)
        expect(overlaps(frame.nodes[i].rect, frame.nodes[j].rect)).toBe(false);
  });

  it("keeps growing nodes separated throughout the morph beside stationary foreign dots", () => {
    const model = prepareTopicMap(
      data(
        Array.from({ length: 100 }, (_, i) =>
          point(`trace-${i}`, (i % 10) * 0.6, Math.floor(i / 10) * 0.5, {
            topicId: i % 5 === 0 ? "retrieval" : "billing",
          }),
        ),
      ),
      topics,
    );
    for (const zoom of [3.01, 4, 5, 6, 7, 8, 9, 10, 16]) {
      const all = [...frameFor(model, zoom, size, "billing").nodeById.values()];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          if (all[i].expansion === 0 && all[j].expansion === 0) continue;
          expect(overlaps(all[i].rect, all[j].rect)).toBe(false);
        }
      }
    }
  });
  it("reserves local clearance for nodes outside the viewport", () => {
    const plot = { width: 360, height: 500 };
    const crowded = frameAt(
      [
        { x: 10, y: 250 },
        { x: -70, y: 250 },
      ],
      plot,
    );
    const alone = frameAt([{ x: 10, y: 250 }], plot);
    expect(crowded.nodes).toHaveLength(1);
    expect(crowded.nodeById.size).toBe(2);
    expect(crowded.nodes[0].rect.width).toBeLessThan(alone.nodes[0].rect.width);
    expect(
      overlaps(crowded.nodes[0].rect, crowded.nodeById.get("trace-1")!.rect),
    ).toBe(false);
  });
  it("retains every visible glyph in dense and coincident cohorts", () => {
    const frame = frameAt(
      Array.from({ length: 500 }, (_, i) => ({
        x: 20 + (i % 30) * 20,
        y: 20 + Math.floor(i / 30) * 20,
      })),
    );
    expect(frame.nodes).toHaveLength(500);
    expect(frame.nodeById.size).toBe(500);
    const coincident = frameAt([
      { x: 500, y: 300 },
      { x: 500, y: 300 },
    ]);
    expect(coincident.nodes).toHaveLength(2);
    expect(
      coincident.nodes.every(
        (node) => node.expansion === 0 && node.textOpacity === 0,
      ),
    ).toBe(true);
  });
  it("hit-tests the grown rounded rectangle instead of only its original dot", () => {
    const frame = frameAt([{ x: 500, y: 300 }]);
    const node = frame.nodes[0];
    expect(
      hitMapNode(frame, { x: node.center.x + 100, y: node.center.y })?.traceId,
    ).toBe(node.point.traceId);
    expect(
      hitMapNode(frame, { x: node.rect.x + 1, y: node.rect.y + 1 }),
    ).toBeNull();
    expect(
      hitMapNode(frame, {
        x: node.rect.x + node.rect.width + 20,
        y: node.center.y,
      }),
    ).toBeNull();
  });
  it("shares parallax positions with hits and fades decorative motion in reading mode", () => {
    const model = prepareTopicMap(
      data(
        Array.from({ length: 20 }, (_, i) => point(`trace-${i}`, i * 10, 0)),
      ),
      topics,
    );
    const chosen = [...model.points].sort((a, b) => b.depth - a.depth)[0];
    const moving = frameFor(model, 1, size, null, { x: 1, y: 0 });
    const node = moving.nodeById.get(chosen.traceId)!;
    const at = { x: node.center.x + 10, y: node.center.y };
    expect(hitMapNode(moving, at)?.traceId).toBe(chosen.traceId);
    expect(hitMapNode(frameFor(model, 1), at)).toBeNull();
    expect(
      frameFor(model, 10, size, null, { x: 1, y: -1 }).nodeById.get(
        chosen.traceId,
      )?.center,
    ).toEqual(frameFor(model, 10).nodeById.get(chosen.traceId)?.center);
  });
  it("uses interpolated world overrides for rectangles and hits", () => {
    const model = prepareTopicMap(data([point("trace", 0, 0)]), topics);
    const layout = prepareNodeLayout(model, size);
    const view = { x: 0, y: 0, zoom: 10 };
    const overrides = new Map([["trace", { x: 0.001, y: -0.001 }]]);
    const frame = prepareMapNodes(
      model,
      layout,
      view,
      size,
      pointer,
      null,
      overrides,
    );
    const node = frame.nodes[0];
    expect(node.worldPosition).toEqual(overrides.get("trace"));
    expect(node.center).toEqual(
      screenPoint(overrides.get("trace")!, view, model.bounds, size),
    );
    expect(hitMapNode(frame, node.center)?.traceId).toBe("trace");
  });
});
describe("explicit map hover", () => {
  it("does not revive a stationary hover when the original viewport returns", () => {
    const frame = frameAt([{ x: 500, y: 300 }], size, 1);
    const store = createTopicMapStore();
    const pointerAt = { x: 500, y: 300 };
    publishTopicMapFrame(store, frame);
    setTopicMapHover(store, "trace-0", "billing", pointer, pointerAt);
    const token = store.getState().hoverLabels[0].token;
    expect(getTopicMapHover(store.getState(), frame).hoveredId).toBe("trace-0");

    const resized = { ...frame, size: { ...size, width: size.width - 100 } };
    publishTopicMapFrame(store, resized);
    expect(getTopicMapHover(store.getState(), resized).hoveredId).toBeNull();
    finishTopicMapHover(store, token);
    publishTopicMapFrame(store, frame);

    expect(getTopicMapHover(store.getState(), frame)).toEqual({
      hoveredId: null,
      hoveredZoneId: null,
    });
    expect(store.getState().pointerAt).toEqual(pointerAt);
  });
  it("requires fresh hover input after nodes move with an unchanged camera", () => {
    const frame = frameAt([{ x: 500, y: 300 }], size, 1);
    const store = createTopicMapStore();
    publishTopicMapFrame(store, frame);
    setTopicMapHover(store, "trace-0", "billing", pointer, { x: 500, y: 300 });

    publishTopicMapFrame(store, frame, true);
    expect(getTopicMapHover(store.getState(), frame).hoveredId).toBeNull();
    publishTopicMapFrame(store, frame);
    expect(getTopicMapHover(store.getState(), frame).hoveredId).toBeNull();

    setTopicMapHover(store, "trace-0", "billing", pointer, { x: 501, y: 300 });
    expect(getTopicMapHover(store.getState(), frame).hoveredId).toBe("trace-0");
  });
  it("shows only explicit tooltips and suppresses them over readable nodes", () => {
    const frame = frameAt([{ x: 500, y: 300 }]);
    expect(prepareMapHover(frame, null, null)).toEqual({
      traces: [],
      zones: [],
    });
    expect(prepareMapHover(frame, "trace-0", "billing")).toEqual({
      traces: [],
      zones: [],
    });
    const cloud = frameAt([{ x: 500, y: 300 }], size, 1);
    const hover = prepareMapHover(cloud, "trace-0", "billing");
    expect(hover.traces).toHaveLength(1);
    expect(hover.zones).toHaveLength(0);
    expect(hover.traces[0].excerpt).toBe(cloud.model.points[0].summary);
    expect(prepareMapHover(cloud, null, "billing").zones[0].detail).toBe(
      topics[0].description,
    );
  });
  it.each([
    { edge: "left", x: 2, y: 250 },
    { edge: "right", x: 358, y: 250 },
    { edge: "top", x: 180, y: 2 },
    { edge: "bottom", x: 180, y: 498 },
    { edge: "clipped left", x: -2, y: 250 },
    { edge: "clipped bottom", x: 180, y: 502 },
  ])(
    "keeps hover bounded at the $edge without covering its node",
    ({ x, y }) => {
      const plot = { width: 360, height: 500 };
      const frame = frameAt([{ x, y }], plot, 1);
      const tooltip = prepareMapHover(frame, "trace-0", "billing").traces[0];
      expect(tooltip).toBeDefined();
      expect(tooltip.card.x).toBeGreaterThanOrEqual(0);
      expect(tooltip.card.y).toBeGreaterThanOrEqual(0);
      expect(tooltip.card.x + tooltip.card.width).toBeLessThanOrEqual(
        plot.width,
      );
      expect(tooltip.card.y + tooltip.card.height).toBeLessThanOrEqual(
        plot.height,
      );
      expect(overlaps(tooltip.card, tooltip.node.rect)).toBe(false);
    },
  );
  it("keeps hover anchors independent of other hover labels", () => {
    const frame = frameAt(
      [
        { x: 500, y: 300 },
        { x: 510, y: 300 },
      ],
      size,
      1,
    );
    expect(prepareMapHover(frame, "trace-0", "billing").traces[0].card).toEqual(
      prepareMapHover(frame, "trace-0", null).traces[0].card,
    );
    expect(prepareMapHover(frame, "trace-0", "billing").zones).toHaveLength(0);
  });
});
