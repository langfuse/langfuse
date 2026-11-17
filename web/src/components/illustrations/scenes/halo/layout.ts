/**
 * Halo, Langfuse's agent, doing a job on your behalf, drawn for the empty states' style: your message types into a card,
 * passes into the raised Halo block, three steps leave it down a trunk and land as cards, and the result rises last
 * with its value counting up. Plan coordinates; the frame fits the drawing.
 */

import { activeIndexOf } from "../../engine/activeIndex";
import { packetKeyframes, type Keyframes } from "../../engine/keyframes";
import {
  charWidth,
  chipHeight,
  chipWidth,
  fitFrame,
  floorFor,
  PROJECTION,
  type Rect,
  round,
  textWidth,
} from "../../engine/projection";
import type { SceneLayout } from "../../engine/Scene";
import { asWritten, identifier, label, type Slot } from "../../engine/slots";
import { formatValue } from "../../engine/values";
import { HALO_LIMITS, type HaloContent } from "./content";

const MESSAGE = { minWidth: 240, height: 34, padX: 14, baseline: 22, size: 14 };
/** HaloIcon's 24-unit artwork, drawn on the face at `scale`. */
const MARK = { scale: 1.6, x: 10, y: 3.6 };
const HERO = { y: 66, height: 48, depth: 16, minWidth: 150, gap: 8, size: 16 };
/** Where the message's wire meets the hero, and where the trunk leaves it. */
const INLET_X = 40;
const TRUNK_X = 22;
/** 36 below the face: the cards' right ends, which the −20° axis lifts, keep 8 px from the hero's sides. */
const ROWS = {
  x: 46,
  gap: 36,
  pitch: 40,
  height: 30,
  width: 230,
  chip: 13,
  chipPadX: 5,
  pad: 9,
  text: 13,
};
/** The result card: its text sits `drop` below the card's middle, its value keeps `gap` px clear of its label. */
const RESULT = {
  height: 36,
  size: 14,
  drop: 5,
  padX: 12,
  valueInset: 34,
  gap: 8,
};
const PAD = { x: 20, top: 30, bottom: 26 };
const GRID = { cell: 36, u: 0, v: 0 };
const NAME = "halo";

/**
 * Run timing in ms. The steps clear 30 ms apart; the message types out, its packet drops into Halo, which presses as
 * it lands; each step leaves Halo as a packet, 280 ms after the last, and its card rises as it lands, its dot a beat
 * later; the result rises once the last step has landed and counts up. The job changes each run.
 */
const RUN = {
  clearStep: 30,
  type: 120,
  perChar: 16,
  speed: 0.45,
  afterPress: 120,
  callStep: 280,
  dot: 80,
  result: 140,
  count: 600,
};

type HaloRow = {
  verb: Slot;
  object: Slot;
  card: Rect;
  mid: number;
  chip: { x: number; y: number };
  textX: number;
  dot: { x: number; y: number };
  clearAt: number;
  departAt: number;
  arriveAt: number;
  packet: Keyframes;
};

const FALLBACK: HaloContent = {
  jobs: [
    {
      ask: "Help me",
      steps: [{ verb: "look", object: "at your project" }],
      result: { label: "done", value: 1, format: "count" },
    },
  ],
};

/** The jobs within the limit, or one stand-in when none are given. */
export const jobsOf = (content: HaloContent) =>
  (content.jobs.length > 0 ? content.jobs : FALLBACK.jobs).slice(
    0,
    HALO_LIMITS.jobs,
  );

/** HaloIcon's paths (halo, speech-bubble head, eyes, ears), placed on the face at MARK's scale and offset. */
function markPaths(face: Rect) {
  const { scale, x, y } = MARK;
  const p = (u: number, v: number) =>
    `${round(face.x + x + u * scale)} ${round(face.y + y + v * scale)}`;
  return {
    halo: {
      cx: round(face.x + x + 12 * scale),
      cy: round(face.y + y + 5 * scale),
      rx: round(5 * scale),
      ry: round(1.5 * scale),
    },
    head: `M${p(8.8, 18.8)}L${p(5.6, 22)}V${round(face.y + y + 10.8 * scale)}Q${p(5.6, 9.2)} ${p(7.2, 9.2)}H${round(face.x + x + 16.8 * scale)}Q${p(18.4, 9.2)} ${p(18.4, 10.8)}V${round(face.y + y + 17.2 * scale)}Q${p(18.4, 18.8)} ${p(16.8, 18.8)}Z`,
    features: [
      `M${p(9.6, 13.2)}V${round(face.y + y + 14.8 * scale)}`,
      `M${p(14.4, 13.2)}V${round(face.y + y + 14.8 * scale)}`,
      `M${p(4, 14)}H${round(face.x + x + 5.6 * scale)}`,
      `M${p(18.4, 14)}H${round(face.x + x + 20 * scale)}`,
    ].join(""),
  };
}

type HaloJob = HaloContent["jobs"][number];

/** The message card, wide enough for the ask. */
function messageOf(ask: Slot): Rect {
  return {
    x: 0,
    y: 0,
    width: Math.max(
      MESSAGE.minWidth,
      round(2 * MESSAGE.padX + textWidth(ask.text, MESSAGE.size)),
    ),
    height: MESSAGE.height,
  };
}

/** The hero's face, wide enough for the mark and the name. */
function faceOf(): Rect {
  const nameWidth = textWidth(NAME, HERO.size);
  return {
    x: 0,
    y: HERO.y,
    width: Math.max(
      HERO.minWidth,
      round(MARK.x + 24 * MARK.scale + HERO.gap + nameWidth + MARK.x),
    ),
    height: HERO.height,
  };
}

/** The message types out, its packet drops into Halo, Halo presses as it lands, and the first step leaves after. */
function intakeOf(ask: Slot, face: Rect, id: string) {
  const drop = packetKeyframes(
    `${id}-ask`,
    [
      [INLET_X, MESSAGE.height],
      [INLET_X, face.y],
    ],
    RUN.speed,
  );
  const dropAt = RUN.type + [...ask.text].length * RUN.perChar + 60;
  const pressAt = dropAt + drop.duration;
  return { drop, dropAt, pressAt, firstCall: pressAt + RUN.afterPress };
}

const CHIP_HEIGHT = chipHeight(ROWS.chip);

/** One step's card, and the packet that carries it down the trunk from Halo. */
function rowOf(
  step: HaloJob["steps"][number],
  index: number,
  {
    rowsTop,
    faceBottom,
    firstCall,
    id,
  }: {
    rowsTop: number;
    faceBottom: number;
    firstCall: number;
    id: string;
  },
): HaloRow {
  const y = rowsTop + index * ROWS.pitch;
  const mid = y + ROWS.height / 2;
  const verb = label(step.verb, HALO_LIMITS.verb);
  const chip = { x: ROWS.x + ROWS.pad, y: round(mid - CHIP_HEIGHT / 2) };
  const departAt = firstCall + index * RUN.callStep;
  const packet = packetKeyframes(
    `${id}-step-${index}`,
    [
      [TRUNK_X, faceBottom],
      [TRUNK_X, mid],
      [ROWS.x, mid],
    ],
    RUN.speed,
  );
  return {
    verb,
    object: asWritten(step.object, HALO_LIMITS.object),
    card: { x: ROWS.x, y, width: ROWS.width, height: ROWS.height },
    mid,
    chip,
    textX: round(chip.x + chipWidth(verb.text, ROWS.chip, ROWS.chipPadX) + 8),
    dot: { x: ROWS.x + ROWS.width - 14, y: mid },
    clearAt: index * RUN.clearStep,
    departAt,
    arriveAt: departAt + packet.duration,
    packet,
  };
}

/** The result card under the steps, rising once the last one has landed. */
function resultOf(
  result: HaloJob["result"],
  rows: HaloRow[],
  rowsTop: number,
  firstCall: number,
) {
  const y = rowsTop + rows.length * ROWS.pitch + 6;
  const mid = y + RESULT.height / 2;
  const name = identifier(result.label, HALO_LIMITS.label);
  const valueX = ROWS.x + ROWS.width - RESULT.valueInset;
  const nameEnd = ROWS.x + RESULT.padX + textWidth(name.text, RESULT.size);
  return {
    card: { x: ROWS.x, y, width: ROWS.width, height: RESULT.height },
    mid,
    baseline: mid + RESULT.drop,
    size: RESULT.size,
    label: name,
    labelX: ROWS.x + RESULT.padX,
    value: formatValue(result.value, {
      format: result.format,
      max: Math.max(
        1,
        Math.floor((valueX - nameEnd - RESULT.gap) / charWidth(RESULT.size)),
      ),
    }),
    valueX,
    dot: { x: ROWS.x + ROWS.width - 14, y: mid },
    at: (rows.at(-1)?.arriveAt ?? firstCall) + RUN.result,
  };
}

function heroOf(face: Rect, pressAt: number) {
  return {
    face,
    depth: HERO.depth,
    pressAt,
    mark: markPaths(face),
    nameX: round(MARK.x + 24 * MARK.scale + HERO.gap),
    baseline: face.y + 30,
    size: HERO.size,
    name: NAME,
  };
}

/** The trunk down Halo's side, with a branch to each step and to the result. */
function trunkOf(faceBottom: number, rows: HaloRow[], resultMid: number) {
  return [
    `M${TRUNK_X} ${faceBottom}V${resultMid}`,
    ...rows.map(({ mid }) => `M${TRUNK_X} ${mid}H${ROWS.x}`),
    `M${TRUNK_X} ${resultMid}H${ROWS.x}`,
  ].join("");
}

const labelOf = (
  ask: Slot,
  rows: HaloRow[],
  result: ReturnType<typeof resultOf>,
) =>
  `Halo, Langfuse's agent, takes your message "${ask.full}" and does it for you: ${rows
    .map(({ verb, object }) => `${verb.full} ${object.full}`)
    .join(", ")}, ending with ${result.label.full} ${result.value.full}`;

/** One job's parts in plan units, before a frame is fitted around them: `content.active` picks it (wrapped into range; the first when left out). */
function jobPartsOf(content: HaloContent, id: string) {
  const jobs = jobsOf(content);
  const job = jobs[activeIndexOf(content.active ?? 0, 0, jobs.length)]!;
  const ask = asWritten(job.ask, HALO_LIMITS.ask);
  const message = messageOf(ask);
  const face = faceOf();
  const faceBottom = face.y + face.height;
  const intake = intakeOf(ask, face, id);
  const rowsTop = faceBottom + ROWS.gap;
  const rows = job.steps.slice(0, HALO_LIMITS.steps).map((step, index) =>
    rowOf(step, index, {
      rowsTop,
      faceBottom,
      firstCall: intake.firstCall,
      id,
    }),
  );
  const result = resultOf(job.result, rows, rowsTop, intake.firstCall);
  const rects = [message, face, ...rows.map(({ card }) => card), result.card];
  return { ask, message, face, faceBottom, intake, rows, result, rects };
}

type JobParts = ReturnType<typeof jobPartsOf>;
type Frame = ReturnType<typeof fitFrame>;

function framedLayoutOf(
  { ask, message, face, faceBottom, intake, rows, result }: JobParts,
  { viewBox, offset }: Frame,
) {
  return {
    projection: PROJECTION,
    viewBox,
    floor: floorFor(viewBox, viewBox, GRID, { side: 0, top: 0 }),
    plate: null,
    panelGrid: "fades",
    keyframes: [intake.drop, ...rows.map(({ packet }) => packet)],
    runDuration: Math.ceil(result.at + RUN.count + 200),
    ariaLabel: labelOf(ask, rows, result),
    offset,
    message: {
      card: message,
      ask,
      textX: MESSAGE.padX,
      baseline: MESSAGE.baseline,
      size: MESSAGE.size,
      typeAt: RUN.type,
      perChar: RUN.perChar,
    },
    inlet: `M${INLET_X} ${MESSAGE.height}V${face.y}`,
    drop: { keyframes: intake.drop, at: intake.dropAt },
    hero: heroOf(face, intake.pressAt),
    trunk: trunkOf(faceBottom, rows, result.mid),
    rows,
    result,
    chip: { size: ROWS.chip, padX: ROWS.chipPadX },
    textSize: ROWS.text,
    run: RUN,
  } satisfies SceneLayout & Record<string, unknown>;
}

/** Every job in one frame fitted to all of them, so the scene keeps its size as the jobs change, and the longest run among them, so a hover never restarts a run in progress. */
export function layoutHaloJobs(content: HaloContent, id = "lfi") {
  const parts = jobsOf(content).map((_, index) =>
    jobPartsOf({ ...content, active: index }, id),
  );
  const frame = fitFrame(
    parts.flatMap(({ rects }) => rects),
    PAD,
  );
  const jobs = parts.map((job) => framedLayoutOf(job, frame));
  return {
    jobs,
    active: content.active,
    runDuration: Math.max(...jobs.map((job) => job.runDuration)),
  };
}
