/**
 * Experiments, traced from langfuse-docs components/home/img/tools/experiments.png (428 × 421): a chart lying on a
 * tilted plate, with a screen-aligned panel peeking out below it. Plan coordinates through PROJECTION; this image's
 * floor grid is 32 units (Evaluation's is 36), and the chart's guides sit on its lines.
 */

import { stepKeyframes, type Keyframes } from "../../engine/keyframes";
import {
  clamp01,
  gridPath,
  PROJECTION,
  round,
  type Floor,
  type Point,
  type Rect,
} from "../../engine/projection";
import type { SceneLayout } from "../../engine/Scene";
import { identifier, type Slot } from "../../engine/slots";
import { SCENE_FRAMES } from "../frames";
import {
  EXPERIMENTS_LIMITS,
  type ExperimentsContent,
  type ExperimentsPoint,
} from "./content";

const BASE = SCENE_FRAMES.experiments;

const GRID = { cell: 32, u: 19.71, v: 0.07 };
/** The tilted plate, and the panel whose top hides under it. */
const PLATE: Rect = { x: -145.5, y: 127.55, width: 459.4, height: 323.3 };
const PANEL: Rect = { x: 32, y: 300, width: 364, height: 120 };
/** Chart frame: x 0–1 spans x0…x1, y 0–1 spans base…top. */
const CHART = { x0: -76, x1: 220, top: 192, base: 384 };
const GUIDE_STEP = 32;
const GUIDE_OPACITY = [0.28, 0.55];
/** Everything on the plate fades out across u and towards the plate's bottom edge. */
const FADE = { u: [40, 218], v: [405, 450] } as const;
const CHIP = {
  fontSize: 16,
  padX: 4.75,
  height: Math.round(16 * 1.45),
  aboveFirst: 15.5,
};
const RUN_TEXT = { x: -75.6, baseline: 426, fontSize: 13.9 };

/**
 * Run timing in ms. The hero's chip stays put; everything else clears (180 ms), then the guides come back as the
 * run's name types out, the hero's line draws from its chip with the other run 120 ms behind, the hatch settles
 * under the hero's line as it lands, and the crosshair reads it.
 */
const RUN = {
  label: 160,
  perChar: 14,
  guides: 160,
  guideStep: 40,
  guideFade: 240,
  heroDraw: 200,
  otherDraw: 320,
  draw: 700,
  hatch: 840,
  hatchFade: 400,
  /** The hero's chip never clears; its time is unused */
  heroChip: 0,
  otherChip: 380,
  scrub: 1000,
  scrubFor: 820,
} as const;

/** Plan points for a series: numbers spread evenly, [x, y] pairs placed where they say. */
export function experimentsPlanPoints(points: ExperimentsPoint[]): Point[] {
  const capped = points.slice(0, EXPERIMENTS_LIMITS.points);
  const lastIndex = Math.max(1, capped.length - 1);
  return capped.map((point, index) => {
    const [x, y] =
      typeof point === "number" ? [index / lastIndex, point] : point;
    return [
      round(CHART.x0 + clamp01(x) * (CHART.x1 - CHART.x0)),
      round(CHART.base - clamp01(y) * (CHART.base - CHART.top)),
    ];
  });
}

function polyline(points: Point[]) {
  return points.map(([u, v], i) => `${i ? "L" : "M"}${u} ${v}`).join("");
}

/** The crosshair's dot along the hero series and its line across the chart, fading in and out around the scrub. */
function crosshairKeyframes(id: string, points: Point[]): Keyframes[] {
  const [first, last] = [points[0]!, points.at(-1)!];
  const span = last[0] - first[0] || 1;
  const progress = (u: number) => 0.08 + ((u - first[0]) / span) * 0.8;
  const dot = stepKeyframes(
    `${id}-cross-dot`,
    [
      {
        at: 0,
        style: `opacity: 0; transform: translate(${first[0]}px, ${first[1]}px);`,
      },
      ...points.map(([u, v]) => ({
        at: progress(u),
        style: `opacity: 1; transform: translate(${u}px, ${v}px);`,
      })),
      {
        at: 1,
        style: `opacity: 0; transform: translate(${last[0]}px, ${last[1]}px);`,
      },
    ],
    RUN.scrubFor,
  );
  const line = stepKeyframes(
    `${id}-cross-line`,
    [
      { at: 0, style: `opacity: 0; transform: translateX(${first[0]}px);` },
      ...points.map(([u]) => ({
        at: progress(u),
        style: `opacity: 1; transform: translateX(${u}px);`,
      })),
      { at: 1, style: `opacity: 0; transform: translateX(${last[0]}px);` },
    ],
    RUN.scrubFor,
  );
  return [dot, line];
}

const chipCenter = (points: Point[]) =>
  (points[0]?.[1] ?? CHART.top) - CHIP.aboveFirst;

/** Each series' chip centre above its first point; two chips never overlap: the second moves above the hero's, or below when there's no room. */
function chipCentersOf(drawn: ExperimentsContent["series"]): number[] {
  const centers = drawn.map((series) =>
    chipCenter(experimentsPlanPoints(series.points)),
  );
  const [heroCenter, otherCenter] = centers;
  if (
    centers.length !== 2 ||
    Math.abs(heroCenter! - otherCenter!) >= CHIP.height + 3
  )
    return centers;
  const above = heroCenter! - CHIP.height - 6;
  return [
    heroCenter!,
    above - CHIP.height / 2 >= CHART.top - 40
      ? above
      : heroCenter! + CHIP.height + 6,
  ];
}

function seriesOf(content: ExperimentsContent): ExperimentsSeriesLayout[] {
  const drawn = content.series
    .slice(0, EXPERIMENTS_LIMITS.series)
    .filter((series) => series.points.length > 0);
  const centers = chipCentersOf(drawn);
  return drawn.map((entry, index) => {
    const points = experimentsPlanPoints(entry.points);
    const hero = index === 0;
    const last = points.at(-1)!;
    const first = points[0]!;
    return {
      label: identifier(entry.label, EXPERIMENTS_LIMITS.label),
      hero,
      points,
      path: polyline(points),
      area: hero
        ? `${polyline(points)}L${last[0]} ${CHART.base}L${first[0]} ${CHART.base}Z`
        : undefined,
      chip: {
        x: CHART.x0 - 0.25,
        y: round(centers[index]! - CHIP.height / 2),
        tone: hero ? "solid" : "soft",
      },
      drawAt: hero ? RUN.heroDraw : RUN.otherDraw,
      chipAt: hero ? RUN.heroChip : RUN.otherChip,
    };
  });
}

const guidesOf = () =>
  Array.from({ length: (CHART.base - CHART.top) / GUIDE_STEP + 1 }, (_, k) => ({
    v: CHART.top + k * GUIDE_STEP,
    dashed: k % 2 === 1,
    /** The top two guides fade towards the top of the chart. */
    opacity: GUIDE_OPACITY[k] ?? 1,
    at: RUN.guides + k * RUN.guideStep,
  }));

/** The panel under the plate; the plate's grid is drawn by the scene, clipped to the plate and faded, so the frame draws none. */
const FLOOR: Floor = {
  panel: PANEL,
  fade: { cx: BASE.width / 2, cy: BASE.height / 2, r: 1 },
  gridPath: "",
};

const labelOf = (run: Slot, series: ExperimentsSeriesLayout[]) =>
  `Experiment ${run.full}: ${series.map(({ label }) => label.full).join(" compared with ")}`;

export function layoutExperiments(content: ExperimentsContent, id = "lfi") {
  const series = seriesOf(content);
  const run = identifier(content.run, EXPERIMENTS_LIMITS.run);
  const hero = series[0];
  const crosshair = hero ? crosshairKeyframes(id, hero.points) : [];
  return {
    projection: PROJECTION,
    viewBox: BASE,
    floor: FLOOR,
    plate: PLATE,
    panelGrid: "stops",
    keyframes: crosshair,
    runDuration: RUN.scrub + RUN.scrubFor + 80,
    ariaLabel: labelOf(run, series),
    gridPath: gridPath(BASE, GRID),
    fade: FADE,
    chart: CHART,
    guides: guidesOf(),
    series,
    chipFont: CHIP.fontSize,
    chipPadX: CHIP.padX,
    run: {
      slot: run,
      x: RUN_TEXT.x,
      baseline: RUN_TEXT.baseline,
      fontSize: RUN_TEXT.fontSize,
    },
    timing: RUN,
    crosshair,
  } satisfies SceneLayout & Record<string, unknown>;
}

type ExperimentsSeriesLayout = {
  label: Slot;
  hero: boolean;
  points: Point[];
  path: string;
  /** The hatched area under the hero, down to the baseline. */
  area?: string;
  chip: { x: number; y: number; tone: "solid" | "soft" };
  drawAt: number;
  chipAt: number;
};
