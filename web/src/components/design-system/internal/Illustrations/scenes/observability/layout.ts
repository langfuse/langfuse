/**
 * Observability, traced from langfuse-docs components/home/img/tools/observability.png (576 × 483): a time axis along
 * the top and the trace's spans as bars below it, the selected span raised. Bars start at their span's start time;
 * long spans run off the right edge, and rows past the selected one fade. Plan coordinates.
 */

import { packetKeyframes } from "../../engine/keyframes";
import {
  charWidth,
  fitViewBox,
  floorFor,
  project,
  PROJECTION,
  unproject,
  type Rect,
} from "../../engine/projection";
import type { SceneLayout } from "../../engine/Scene";
import { identifier, length, type Slot } from "../../engine/slots";
import { formatValue, type FormattedValue } from "../../engine/values";
import { SCENE_FRAMES } from "../frames";
import {
  OBSERVABILITY_LIMITS,
  type ObservabilityContent,
  type ObservabilitySpan,
} from "./content";

const BASE = SCENE_FRAMES.observability;
const GRID = { cell: 36, u: 11.5, v: 9.6 };
const PANEL_INSET = { side: 32, top: 83 };

const AXIS = {
  x: -131.5,
  step: 108,
  tickTop: 200,
  labelGap: 10.2,
  labelBaseline: 261.3,
  fontSize: 14.5,
};
const ROWS = {
  top: 309.5,
  gap: 18,
  height: 54,
  fontSize: 18,
  pad: 8,
  baseline: 33,
  valueGap: 8,
  costGap: 9.5,
};
const HERO = {
  height: 53,
  fontSize: 20,
  padLeft: 8.5,
  padRight: 7,
  baseline: 35,
  valueGap: 2.3,
  costGap: 3.7,
};
/** The raised block's footprint sits this far below its face, in plan units (16 screen px straight down). */
const [, FOOTPRINT_SHIFT] = unproject([0, 16]);

/**
 * Run timing in ms. Everything but the selected span clears (180 ms), then the playhead sweeps as the spans rise in
 * order, 110 ms apart; the selected span never leaves: its numbers recount, and it presses once they're under way.
 */
const RUN = {
  flash: 200,
  scanAt: 180,
  scanFor: 1300,
  rowAt: 200,
  rowStep: 110,
  rowClearStep: 30,
  press: 440,
  countAfter: 60,
  count: 800,
};

export type ObservabilityRow = {
  hero: boolean;
  name: Slot;
  duration: FormattedValue;
  cost: FormattedValue;
  bar: Rect;
  fontSize: number;
  baseline: number;
  nameX: number;
  durationX: number;
  costX: number;
  opacity: number;
  clearAt: number;
  revealAt: number;
  /** When its duration and cost start counting, and for how long. */
  countAt: number;
  countFor: number;
};

type Axis = {
  ticks: { x: number; label: FormattedValue }[];
  /** The first tick's value, at AXIS.x. */
  origin: number;
  /** Plan units per second. */
  scale: number;
};

/** The hero's tight gaps, widened to a full character when two digits would meet ("v2" + "0.63s"). */
const gapBetween = (
  before: string,
  after: string,
  tight: number,
  char: number,
) => (/\d$/.test(before) && /^\d/.test(after) ? char : tight);

function axisOf(values: number[]): Axis {
  const shown = values.slice(0, OBSERVABILITY_LIMITS.ticks);
  const step = shown.length > 1 ? shown[1]! - shown[0]! : 1;
  return {
    ticks: shown.map((value, index) => ({
      x: AXIS.x + index * AXIS.step,
      label: formatValue(value, { format: "duration", max: 7 }),
    })),
    origin: shown[0] ?? 0,
    scale: AXIS.step / (step || 1),
  };
}

/** A span's three texts, set left to right from where its bar starts. */
function textsOf(span: ObservabilitySpan, x: number, hero: boolean) {
  const fontSize = hero ? HERO.fontSize : ROWS.fontSize;
  const char = charWidth(fontSize);
  const name = identifier(span.name, OBSERVABILITY_LIMITS.name);
  const duration = formatValue(span.duration, {
    format: "duration",
    max: OBSERVABILITY_LIMITS.duration,
  });
  const cost = formatValue(span.cost, {
    format: "currency",
    max: OBSERVABILITY_LIMITS.cost,
  });
  const nameX = x + (hero ? HERO.padLeft : ROWS.pad);
  const nameEnd = nameX + char * length(name.text);
  const durationX =
    nameEnd +
    (hero
      ? gapBetween(name.text, duration.text, HERO.valueGap, char)
      : ROWS.valueGap);
  const costX =
    durationX +
    char * length(duration.text) +
    (hero
      ? gapBetween(duration.text, cost.text, HERO.costGap, char)
      : ROWS.costGap);
  const textEnd = costX + char * length(cost.text);
  return {
    name,
    duration,
    cost,
    fontSize,
    nameX,
    durationX,
    costX,
    nameEnd,
    textEnd,
  };
}

/** One span's row at plan `top`; a raised span sits up off its footprint and wraps its text. */
function rowOf(
  span: ObservabilitySpan,
  index: number,
  {
    selected,
    top,
    start,
    axis,
  }: {
    selected: number;
    top: number;
    start: number;
    axis: Axis;
  },
): ObservabilityRow {
  const hero = index === selected;
  const x = AXIS.x + (start - axis.origin) * axis.scale;
  const { nameEnd, textEnd, ...texts } = textsOf(span, x, hero);
  const y = hero ? top - FOOTPRINT_SHIFT : top;
  const width = hero
    ? textEnd + HERO.padRight - x
    : Math.max(nameEnd + 4.6 - x, span.duration * axis.scale);
  const revealAt = RUN.rowAt + index * RUN.rowStep;
  return {
    hero,
    ...texts,
    bar: { x, y, width, height: hero ? HERO.height : ROWS.height },
    baseline: y + (hero ? HERO.baseline : ROWS.baseline),
    opacity: index > selected ? 0.5 ** (index - selected) : 1,
    clearAt: index * RUN.rowClearStep,
    revealAt,
    countAt: revealAt + RUN.countAfter,
    countFor: RUN.count,
  };
}

/** The spans top to bottom, each starting where its span starts (or where the one above did). */
function rowsOf(content: ObservabilityContent, axis: Axis) {
  const spans = content.spans.slice(0, OBSERVABILITY_LIMITS.spans);
  const selected = Math.min(
    Math.max(0, Math.round(content.selected)),
    spans.length - 1,
  );
  return spans.reduce<{
    rows: ObservabilityRow[];
    top: number;
    start: number;
  }>(
    ({ rows, top, start }, span, index) => {
      const spanStart = span.start ?? start;
      const row = rowOf(span, index, {
        selected,
        top,
        start: spanStart,
        axis,
      });
      const { y, height } = row.bar;
      const footprint = row.hero ? FOOTPRINT_SHIFT : 0;
      return {
        rows: [...rows, row],
        top: y + height + footprint + ROWS.gap,
        start: spanStart,
      };
    },
    { rows: [], top: ROWS.top, start: axis.origin },
  ).rows;
}

/** The base frame, grown so the widest text and the raised span stay in view. */
function frameOf(rows: ObservabilityRow[]) {
  const hero = rows.find((row) => row.hero);
  const textRights = rows.map(
    ({ costX, cost, fontSize, baseline }) =>
      project([costX + charWidth(fontSize) * length(cost.text), baseline])[0],
  );
  const heroRight = hero
    ? [project([hero.bar.x + hero.bar.width, hero.bar.y])[0]]
    : [];
  const heroBottom = hero
    ? project([hero.bar.x, hero.bar.y + hero.bar.height])[1] + 16
    : 0;
  return fitViewBox(
    BASE,
    { right: Math.max(...textRights, ...heroRight), bottom: heroBottom },
    { right: 40, bottom: 28 },
  );
}

/** The playhead sweeping from the first tick to the last over the scan. */
function scanOf(axis: Axis, id: string) {
  const first = axis.ticks[0]?.x ?? AXIS.x;
  const last = axis.ticks.at(-1)?.x ?? first;
  return packetKeyframes(
    `${id}-scan`,
    [
      [first, 0],
      [last, 0],
    ],
    Math.max(1, last - first) / RUN.scanFor,
  );
}

const runDurationOf = (rows: ObservabilityRow[]) =>
  Math.ceil(
    Math.max(
      (rows.at(-1)?.countAt ?? RUN.rowAt) + RUN.count,
      RUN.scanAt + RUN.scanFor,
    ),
  );

const labelOf = (rows: ObservabilityRow[]) =>
  `A trace: ${rows
    .map(
      (row) =>
        `${row.name.full} ${row.duration.full} ${row.cost.full}${row.hero ? " (selected)" : ""}`,
    )
    .join(", ")}`;

export type ObservabilityLayout = ReturnType<typeof layoutObservability>;

export function layoutObservability(content: ObservabilityContent, id = "lfi") {
  const axis = axisOf(content.axis);
  const rows = rowsOf(content, axis);
  const viewBox = frameOf(rows);
  const scan = scanOf(axis, id);
  return {
    projection: PROJECTION,
    viewBox,
    floor: floorFor(viewBox, BASE, GRID, PANEL_INSET),
    plate: null,
    panelGrid: "fades",
    keyframes: [scan],
    runDuration: runDurationOf(rows),
    ariaLabel: labelOf(rows),
    axis: {
      ticks: axis.ticks,
      tickTop: AXIS.tickTop,
      tickBottom: ROWS.top,
      labelGap: AXIS.labelGap,
      labelBaseline: AXIS.labelBaseline,
      fontSize: AXIS.fontSize,
    },
    rows,
    run: { ...RUN, scan },
  } satisfies SceneLayout & Record<string, unknown>;
}
