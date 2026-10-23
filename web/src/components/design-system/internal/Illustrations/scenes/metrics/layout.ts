/**
 * Cost & latency, traced from langfuse-docs components/home/img/tools/metrics.png (428 × 431): an area chart lying on a
 * tilted plate, dashed guides, date ticks, and a crosshair whose flag reads the marked point. Plan coordinates: the
 * time axis runs along u, values run up the chart toward smaller v.
 */

import { stepKeyframes, type Keyframes } from "../../engine/keyframes";
import {
  charWidth,
  clamp01,
  fitViewBox,
  floorFor,
  PROJECTION,
  round,
  screenBounds,
  type Point,
  type Projection,
  type Rect,
} from "../../engine/projection";
import type { SceneLayout } from "../../engine/Scene";
import { identifier, length, truncate, type Slot } from "../../engine/slots";
import { formatValue } from "../../engine/values";
import { SCENE_FRAMES } from "../frames";
import {
  METRICS_DEFAULTS,
  METRICS_LIMITS,
  type MetricsContent,
  type MetricsMarker,
} from "./content";

const BASE = SCENE_FRAMES.metrics;
const METRICS_GRID = { cell: 36, u: 25, v: 0.1 };

/** The same axes as the other illustrations, at 0.886 of their scale (fitted from metrics.png's grid). */
const METRICS_PROJECTION = PROJECTION.map(
  (n) => Math.round(n * 0.886 * 1e4) / 1e4,
) as unknown as Projection;

/** Smaller than the other illustrations' 20: the tooltip and the date ticks, traced from the PNG. */
const FONT = { tooltip: 18, date: 16.5 };
const CHAR = charWidth(FONT.tooltip);
/** The time axis and value range; the line fades out by LINE_END of the axis. */
const CHART = { x: -146, width: 460, baseline: 434.5, height: 184 };
const LINE_END = 0.89;
const GUIDES = [
  { at: 0.25, dashed: true },
  { at: 0.5, dashed: false },
  { at: 0.75, dashed: true },
];
const PLATE: Rect = { x: -162.5, y: 143, width: 518.5, height: 366 };
/** Date ticks are right-aligned: the first ends `first` into the axis, the rest `span / count` apart. */
const DATES = { baseline: 483, first: 39.1, span: 447.75, gap: 12 };
const TOOLTIP = {
  gap: 3.7,
  padX: 7,
  top: 1.8,
  height: 44.5,
  firstBaseline: 16,
  lineHeight: 22,
};

/**
 * Run timing in ms. The baseline flashes as the rest clears, the guides come back 50 ms apart, the line draws at an
 * even pace, and the flag reads it: it appears at the line's start once the line is past the marker, then scrubs
 * there as its count climbs. The hatch settles under the line as it lands.
 */
const RUN = {
  flash: 60,
  guides: 120,
  guideStep: 50,
  guideFor: 240,
  line: 200,
  lineFor: 700,
  hatch: 700,
  hatchFor: 400,
  scrub: 760,
  scrubFor: 700,
  reveal: 160,
};

/** The scrub's stops: from the first point to the marker, at an even horizontal pace. */
function scrubKeyframes(
  name: string,
  points: Point[],
  index: number,
  moveDot: boolean,
): Keyframes {
  const path = points.slice(0, index + 1);
  const [mu, mv] = points[index] ?? [0, 0];
  const start = path[0]?.[0] ?? mu;
  const span = mu - start || 1;
  const stops = path.map(([u, v]) => ({
    at: index === 0 ? 1 : (u - start) / span,
    style: `transform: translate(${round(u - mu)}px, ${moveDot ? round(v - mv) : 0}px);`,
  }));
  return stepKeyframes(name, stops, RUN.scrubFor);
}

/** The series' plan points: values up the chart, at their positions or spread evenly up to LINE_END. */
function pointsOf(content: MetricsContent): Point[] {
  const values = content.points.slice(0, METRICS_LIMITS.points).map(clamp01);
  const count = Math.max(1, values.length);
  const positions =
    content.positions?.length === values.length
      ? content.positions.map(clamp01)
      : values.map((_, i) => (count === 1 ? 0 : (i / (count - 1)) * LINE_END));
  return values.map((value, i) => [
    round(CHART.x + positions[i]! * CHART.width),
    round(CHART.baseline - value * CHART.height),
  ]);
}

/** The line through the points and the hatched area under it, down to the baseline. */
function shapesOf(points: Point[]) {
  const line = points.map(([u, v], i) => `${i ? "L" : "M"}${u} ${v}`).join("");
  const first = points[0] ?? [CHART.x, CHART.baseline];
  const last = points.at(-1) ?? first;
  const area =
    points.length > 1
      ? `${line}L${last[0]} ${CHART.baseline}L${first[0]} ${CHART.baseline}Z`
      : "";
  return { line, area, first };
}

/** Date ticks along the axis; crowded axes get shorter labels, so neighbouring dates never overlap. */
function datesOf(content: MetricsContent) {
  const shownDates = content.dates.slice(0, METRICS_LIMITS.dates);
  const dateStep = DATES.span / Math.max(1, shownDates.length);
  const dateChars = Math.max(
    3,
    Math.min(
      METRICS_LIMITS.date,
      Math.floor((dateStep - DATES.gap) / charWidth(FONT.date)),
    ),
  );
  return shownDates.map((date, i) => ({
    slot: identifier(date, dateChars),
    x: round(CHART.x + DATES.first + i * dateStep),
    y: DATES.baseline,
  }));
}

/** The flag's texts and box beside the marked point, flipped to its left when it would run past the line's end. */
function tooltipOf(marker: MetricsMarker, [markerU]: Point, top: number) {
  const date = identifier(marker.date, METRICS_LIMITS.date);
  const value = formatValue(marker.value, {
    format: marker.format ?? "count",
    max: METRICS_LIMITS.value,
  });
  const unit = truncate(marker.unit.trim(), METRICS_LIMITS.unit);
  const chipWidth =
    Math.max(
      length(date.text),
      length(value.text) + (unit ? 1 + length(unit) : 0),
    ) *
      CHAR +
    2 * TOOLTIP.padX;
  const flip =
    markerU + TOOLTIP.gap + chipWidth > CHART.x + CHART.width * LINE_END;
  const chip: Rect = {
    x: round(flip ? markerU - TOOLTIP.gap - chipWidth : markerU + TOOLTIP.gap),
    y: top + TOOLTIP.top,
    width: round(chipWidth),
    height: TOOLTIP.height,
  };
  return {
    flip,
    tooltip: {
      chip,
      date,
      value,
      unit,
      textX: chip.x + TOOLTIP.padX,
      firstBaseline: chip.y + TOOLTIP.firstBaseline,
      secondBaseline: chip.y + TOOLTIP.firstBaseline + TOOLTIP.lineHeight,
    },
  };
}

const frameOf = (chip: Rect) =>
  fitViewBox(BASE, screenBounds([chip], METRICS_PROJECTION), {
    right: 24,
    bottom: 24,
  });

const labelOf = ({
  value,
  unit,
  date,
}: {
  value: { full: string };
  unit: string;
  date: Slot;
}) =>
  `Cost and latency over time: ${value.full}${unit ? ` ${unit}` : ""} on ${date.full}`;

/** A marker given in part keeps the default's other fields. */
export function layoutMetrics(content: MetricsContent, id = "lfi") {
  const marker = { ...METRICS_DEFAULTS.marker, ...content.marker };
  const points = pointsOf(content);
  const { line, area, first } = shapesOf(points);
  const top = CHART.baseline - CHART.height;
  const index = Math.min(
    points.length - 1,
    Math.max(0, Math.round(marker.index)),
  );
  const markerPoint = points[index] ?? first;
  const { flip, tooltip } = tooltipOf(marker, markerPoint, top);
  const viewBox = frameOf(tooltip.chip);
  const scrub = {
    pole: scrubKeyframes(`${id}-scrub-pole`, points, index, false),
    dot: scrubKeyframes(`${id}-scrub-dot`, points, index, true),
  };
  return {
    projection: METRICS_PROJECTION,
    viewBox,
    floor: floorFor(
      viewBox,
      BASE,
      METRICS_GRID,
      { side: 32, top: 200 },
      METRICS_PROJECTION,
    ),
    plate: PLATE,
    panelGrid: "stops",
    keyframes: [scrub.pole, scrub.dot],
    runDuration: RUN.scrub + RUN.scrubFor + 100,
    ariaLabel: labelOf(tooltip),
    font: FONT,
    chart: { ...CHART, top, end: CHART.x + CHART.width * LINE_END },
    guides: GUIDES.map(({ at, dashed }) => ({
      v: CHART.baseline - at * CHART.height,
      dashed,
    })),
    line,
    area,
    dates: datesOf(content),
    marker: { u: markerPoint[0], v: markerPoint[1], flip },
    tooltip,
    scrub,
    run: RUN,
  } satisfies SceneLayout & Record<string, unknown>;
}
