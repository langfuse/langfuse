import { describe, expect, it } from "vitest";
import { resolveDensity } from "./density";
import {
  formatDurationMs,
  layout,
  prepareTimeline,
  type LayoutNode,
  type PositionedNode,
  type TimelineLayout,
} from "./layout";
import { PX_PER_LETTER, createTextMeasurerFrom } from "./textMeasurer";
import { tooltipPlacement } from "./tooltipPlacement";
import {
  MAX_ZOOM_PRECISION_MS,
  clampView,
  traceSpaceOf,
  zoomToSpan,
  zoomView,
} from "./viewTransform";
import {
  TIMELINE_SHAPES,
  longTailTrace,
  reporterTrace,
  singleSpan,
} from "./__tests__/timelineV2.fixtures";

// Explicit null context: the PX_PER_LETTER fallback, so widths are
// deterministic and jsdom is never asked for a canvas.
const measurer = createTextMeasurerFrom(null);

const BOXES = [
  { width: 320, height: 240 },
  { width: 480, height: 240 },
  { width: 768, height: 640 },
  { width: 1280, height: 640 },
  { width: 1920, height: 900 },
];

function run(
  roots: readonly LayoutNode[],
  box: { width: number; height: number },
  options: Partial<Parameters<typeof layout>[0]> = {},
): TimelineLayout {
  const prepared = prepareTimeline(roots, options.collapsed);
  return layout({
    roots,
    box,
    density: options.density ?? resolveDensity({ pointer: "fine" }),
    measurer,
    view: options.view ?? null,
    compress: options.compress ?? false,
    prepared,
    ...options,
  });
}

const numbersOf = (node: PositionedNode) => [
  node.x,
  node.width,
  node.y,
  node.height,
  node.labelX,
  node.labelWidth,
  node.startMs,
  node.endMs,
  node.firstTokenX ?? 0,
  node.durationMs ?? 0,
];

describe("layout", () => {
  it("renders synthetic session and trace rows without using them as compression spans", () => {
    const observation: LayoutNode = {
      id: "observation",
      name: "Observation",
      type: "SPAN",
      startTime: new Date(1_000),
      endTime: new Date(2_000),
      children: [],
    };
    const trace: LayoutNode = {
      id: "trace-t",
      name: "Trace",
      type: "TRACE",
      startTime: new Date(500),
      endTime: new Date(2_000),
      children: [observation],
    };
    const session: LayoutNode = {
      id: "session-s",
      name: "Session",
      type: "SESSION",
      startTime: new Date(0),
      endTime: new Date(3_000),
      children: [trace],
    };

    const prepared = prepareTimeline([session]);

    expect(prepared.rows.map((row) => row.node.id)).toEqual([
      "session-s",
      "trace-t",
      "observation",
    ]);
    expect(prepared.spans).toEqual([[1_000, 2_000]]);
  });

  it("scales to the measured box instead of a fixed canvas", () => {
    const roots = singleSpan();

    const narrow = run(roots, { width: 320, height: 240 });
    const wide = run(roots, { width: 1280, height: 240 });

    // Same trace, same fitted view; only the box differs.
    expect(narrow.nodes[0]!.width).toBeCloseTo(320, 0);
    expect(wide.nodes[0]!.width).toBeCloseTo(1280, 0);
    expect(narrow.view).toEqual(narrow.traceSpace);
  });

  it("keeps every bar and label inside the box for every shape and width", () => {
    for (const [shape, makeRoots] of Object.entries(TIMELINE_SHAPES)) {
      const roots = makeRoots();
      for (const box of BOXES) {
        const result = run(roots, box, { compress: true });
        for (const node of result.nodes) {
          const context = `${shape} @ ${box.width}px, node ${node.id}`;
          expect(node.x, context).toBeGreaterThanOrEqual(0);
          expect(node.x + node.width, context).toBeLessThanOrEqual(
            box.width + 0.001,
          );
          if (node.labelPlacement !== "hidden") {
            expect(node.labelX, context).toBeGreaterThanOrEqual(0);
            expect(node.labelX + node.labelWidth, context).toBeLessThanOrEqual(
              box.width + 0.001,
            );
          }
        }
        for (const tick of result.ticks) {
          expect(tick.x, `${shape} @ ${box.width}px tick`).toBeLessThanOrEqual(
            box.width + 0.001,
          );
        }
      }
    }
  });

  it("stays finite on degenerate shapes, degenerate boxes and compression", () => {
    const boxes = [
      ...BOXES,
      { width: 0, height: 0 },
      { width: 320, height: 0 },
    ];

    for (const [shape, makeRoots] of Object.entries(TIMELINE_SHAPES)) {
      const roots = makeRoots();
      for (const box of boxes) {
        for (const compress of [false, true]) {
          const result = run(roots, box, { compress });
          const context = `${shape} @ ${box.width}x${box.height} compress=${compress}`;

          expect(Number.isFinite(result.pxPerMs), context).toBe(true);
          expect(Number.isFinite(result.contentHeight), context).toBe(true);
          expect(Number.isFinite(result.traceSpace.duration), context).toBe(
            true,
          );
          expect(Number.isFinite(result.view.duration), context).toBe(true);

          for (const node of result.nodes) {
            for (const value of numbersOf(node)) {
              expect(Number.isFinite(value), `${context} ${node.id}`).toBe(
                true,
              );
            }
          }
          for (const tick of result.ticks) {
            expect(Number.isFinite(tick.x), context).toBe(true);
          }
          for (const gap of result.gaps) {
            expect(
              Number.isFinite(gap.x) && Number.isFinite(gap.width),
              context,
            ).toBe(true);
          }
        }
      }
    }

    // No roots at all is a shape too.
    const empty = run([], { width: 320, height: 240 });
    expect(empty.nodes).toEqual([]);
    expect(empty.contentHeight).toBe(0);
  });

  it("places the duration label inside a wide bar and outside a narrow one", () => {
    const wide = run(singleSpan(), { width: 1280, height: 240 }).nodes[0]!;
    expect(wide.labelPlacement).toBe("inside");
    expect(wide.labelX).toBeGreaterThan(wide.x);

    // The last span of the reporter trace is 1ms at the right edge: there is no
    // room inside the bar, and none after it either.
    const narrow = run(reporterTrace(), { width: 320, height: 240 });
    const lastSpan = narrow.nodes[narrow.nodes.length - 1]!;
    expect(lastSpan.width).toBeLessThan(8);
    expect(lastSpan.labelPlacement).toBe("before");
  });

  it("compression makes a long-tail trace legible and stays reversible", () => {
    const roots = longTailTrace();
    const box = { width: 320, height: 240 };

    const honest = run(roots, box, { compress: false });
    const compressed = run(roots, box, { compress: true });

    const leafWidth = (result: TimelineLayout) =>
      Math.max(...result.nodes.filter((n) => n.depth > 0).map((n) => n.width));

    // Fitted honestly, 40ms of work in a 36s trace is a sub-pixel sliver
    // pinned to the minimum bar width; compressed, it is a real bar.
    expect(leafWidth(honest)).toBe(4);
    expect(leafWidth(compressed)).toBeGreaterThan(20);
    expect(compressed.gaps.length).toBeGreaterThan(0);
    expect(compressed.compression.compressedDurationMs).toBeLessThan(
      compressed.realDurationMs,
    );

    // Round-trip: the axis labels read real time back out of compressed space.
    for (const realMs of [0, 40, 18_000, 36_020]) {
      expect(
        compressed.compression.toRealMs(
          compressed.compression.toCompressedMs(realMs),
        ),
      ).toBeCloseTo(realMs, 3);
    }
  });

  it("positions only the mounted row window", () => {
    const roots = TIMELINE_SHAPES.huge();
    const box = { width: 768, height: 640 };
    const windowed = run(roots, box, {
      rowRange: { startIndex: 100, endIndex: 139 },
    });

    expect(windowed.nodes).toHaveLength(40);
    expect(windowed.rowCount).toBe(10_000);
    expect(windowed.nodes[0]!.index).toBe(100);
    expect(windowed.nodes[0]!.y).toBe(100 * windowed.rowHeight);
  });
});

describe("view transform", () => {
  it("clamps the window inside trace space and floors the zoom", () => {
    const space = traceSpaceOf(1_000);

    expect(clampView({ start: -500, duration: 5_000 }, space)).toEqual({
      start: 0,
      duration: 1_000,
    });
    // Panning past the end holds the zoom level and pulls the start back.
    expect(clampView({ start: 900, duration: 400 }, space)).toEqual({
      start: 600,
      duration: 400,
    });
    expect(
      clampView({ start: 0, duration: 0.001 }, space).duration,
    ).toBeCloseTo(MAX_ZOOM_PRECISION_MS, 6);
    expect(clampView({ start: NaN, duration: NaN }, space)).toEqual({
      start: 0,
      duration: 1_000,
    });
    // A collapsed trace has nowhere to zoom to.
    expect(clampView({ start: 0, duration: 10 }, traceSpaceOf(0))).toEqual({
      start: 0,
      duration: 0,
    });
  });

  it("zooms about the anchor and zoom-to-span pads both sides", () => {
    const space = traceSpaceOf(1_000);
    const zoomed = zoomView({ start: 0, duration: 1_000 }, space, {
      factor: 2,
      anchorRatio: 0.5,
    });
    expect(zoomed).toEqual({ start: 250, duration: 500 });

    const fitted = zoomToSpan({ start: 400, duration: 100 }, space, 0.1);
    expect(fitted.start).toBeCloseTo(390, 6);
    expect(fitted.duration).toBeCloseTo(120, 6);
  });
});

describe("density", () => {
  it("resolves from the pointer modality and lines per row", () => {
    // Never a function of box height: a short trace in a tall box keeps
    // Finder-row density rather than growing into the slack.
    expect(resolveDensity({ pointer: "fine" }).rowHeight).toBe(26);
    expect(resolveDensity({ pointer: "coarse" }).rowHeight).toBe(44);
    // A stacked row (name above bar) needs two text lines' worth.
    expect(resolveDensity({ pointer: "fine", lines: 2 }).rowHeight).toBe(38);
    expect(resolveDensity({ pointer: "coarse", lines: 2 }).rowHeight).toBe(44);
  });
});

describe("textMeasurer", () => {
  // Every glyph 10px wide, so a measured width is countable by hand and the
  // per-letter fallback (6.5) is visible whenever one is used by mistake.
  const tenPerGlyph = {
    font: "",
    measureText: (text: string) => ({ width: text.length * 10 }),
  } as unknown as CanvasRenderingContext2D;

  it("measures every unit in a compound label, not just the last", () => {
    const measure = createTextMeasurerFrom(tenPerGlyph).measure;

    // `1m 35s` is six glyphs, so 60 — and it is only 60 if the leading `m` was
    // measured too. Matching a unit only as the whole remainder of the string
    // left it on the flat estimate, which is what every label above a minute is.
    expect(measure("1m 35s")).toBeCloseTo(60, 6);
    expect(measure("1h 30m")).toBeCloseTo(60, 6);
    expect(measure("486ms")).toBeCloseTo(50, 6);
    expect(measure("1.24s")).toBeCloseTo(50, 6);
    // Longest-first matching, so `min` is one unit rather than `m` plus letters.
    expect(measure("5min")).toBeCloseTo(40, 6);
    expect(measure("∑ 1.24s")).toBeCloseTo(70, 6);
  });

  it("corrects for a canvas that refused the font it was given", () => {
    // A real canvas keeps `10px sans-serif` when it rejects a font string, and
    // then measures 10px glyphs for a 12px label — 20% short, silently.
    const stubborn: { font: string; measureText: (t: string) => TextMetrics } =
      {
        font: "10px sans-serif",
        measureText: (text: string) =>
          ({ width: text.length * 10 }) as TextMetrics,
      };
    Object.defineProperty(stubborn, "font", {
      get: () => "10px sans-serif",
      set: () => undefined,
    });
    const measure = createTextMeasurerFrom(
      stubborn as unknown as CanvasRenderingContext2D,
      "20px test",
    ).measure;
    // Asked for 20px, measured at 10px: every width doubles back to the truth.
    expect(measure("abc")).toBeCloseTo(60, 6);
  });

  it("falls back to a flat per-letter width with no canvas", () => {
    expect(createTextMeasurerFrom(null).measure("1m 35s")).toBeCloseTo(
      6 * PX_PER_LETTER,
      6,
    );
  });
});

describe("tooltipPlacement", () => {
  /** The box the placement implies, given a content size it never asks about. */
  const boxOf = (
    placement: ReturnType<typeof tooltipPlacement>,
    height: number,
  ) => {
    const width = placement.maxWidth;
    const flipX = placement.transform.includes("-100%,");
    const flipY = placement.transform.endsWith("-100%)");
    return {
      left: flipX ? placement.left - width : placement.left,
      right: flipX ? placement.left : placement.left + width,
      top: flipY ? placement.top - height : placement.top,
      bottom: flipY ? placement.top : placement.top + height,
    };
  };

  it("never leaves the viewport, at any window size or pointer position", () => {
    // Phone through desktop, including the widths where a fixed 320px cap and a
    // fixed flip threshold disagree — that combination ran the box off the right
    // edge for any pointer just short of the threshold.
    for (const viewportWidth of [320, 480, 700, 800, 830, 1024, 1280, 1920]) {
      for (const viewportHeight of [300, 568, 658, 900]) {
        for (const fraction of [0, 0.1, 0.49, 0.5, 0.51, 0.59, 0.6, 0.61, 1]) {
          const clientX = Math.round(viewportWidth * fraction);
          const clientY = Math.round(viewportHeight * fraction);
          const placement = tooltipPlacement({
            clientX,
            clientY,
            viewportWidth,
            viewportHeight,
          });
          // Two text lines, and then some, since the metrics line can wrap.
          const box = boxOf(placement, 80);
          const at = `${viewportWidth}x${viewportHeight} @${fraction}`;
          expect(box.left, `left ${at}`).toBeGreaterThanOrEqual(0);
          expect(box.right, `right ${at}`).toBeLessThanOrEqual(viewportWidth);
          expect(box.top, `top ${at}`).toBeGreaterThanOrEqual(0);
          expect(box.bottom, `bottom ${at}`).toBeLessThanOrEqual(
            viewportHeight,
          );
        }
      }
    }
  });

  it("takes the roomier side of the pointer", () => {
    const viewport = { viewportWidth: 1000, viewportHeight: 800 };
    // Left of centre: grow right and down, anchored at the pointer.
    expect(
      tooltipPlacement({ clientX: 100, clientY: 100, ...viewport }).transform,
    ).toBe("translate(0, 0)");
    // Right of centre: grow left and up, anchored by its own far edge.
    expect(
      tooltipPlacement({ clientX: 900, clientY: 700, ...viewport }).transform,
    ).toBe("translate(-100%, -100%)");
  });

  it("spends the room it has, and never more", () => {
    const viewport = { viewportWidth: 1000, viewportHeight: 800 };
    // Middle of a wide window: the full width is affordable.
    expect(
      tooltipPlacement({ clientX: 300, clientY: 400, ...viewport }).maxWidth,
    ).toBe(320);
    // 200px from the left edge leaves 200 minus the offset and the margin.
    expect(
      tooltipPlacement({ clientX: 200, clientY: 400, ...viewport }).maxWidth,
    ).toBe(320);
    expect(
      tooltipPlacement({
        clientX: 120,
        clientY: 400,
        viewportWidth: 260,
        viewportHeight: 800,
      }).maxWidth,
    ).toBe(260 - 120 - 16);
  });
});

describe("formatDurationMs", () => {
  it("keeps labels short at every magnitude", () => {
    expect(formatDurationMs(0)).toBe("0ms");
    expect(formatDurationMs(486)).toBe("486ms");
    expect(formatDurationMs(1_240)).toBe("1.24s");
    expect(formatDurationMs(36_020)).toBe("36.02s");
    expect(formatDurationMs(95_000)).toBe("1m 35s");
    expect(formatDurationMs(5_400_000)).toBe("1h 30m");
    expect(formatDurationMs(NaN)).toBe("0ms");
  });
});
