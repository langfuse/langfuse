/**
 * Evaluation, traced from langfuse-docs components/home/img/tools/evaluation.png (576 × 436): an execution card, a
 * trunk into the raised evaluator, and one score row per branch. Plan coordinates; text is 20px, 12 units a character.
 */

import { packetKeyframes, type Keyframes } from "../../engine/keyframes";
import {
  charWidth,
  fitViewBox,
  floorFor,
  PROJECTION,
  screenBounds,
  type Rect,
} from "../../engine/projection";
import type { SceneLayout } from "../../engine/Scene";
import { label, length, type Slot } from "../../engine/slots";
import { formatValue, type FormattedValue } from "../../engine/values";
import { SCENE_FRAMES } from "../frames";
import {
  EVALUATION_LIMITS,
  statusOf,
  type EvaluationContent,
  type ScoreStatus,
} from "./content";

const BASE = SCENE_FRAMES.evaluation;
const EVALUATION_GRID = { cell: 36, u: 8.5, v: 3.3 };

const CHAR = charWidth(20);
const TRUNK_X = 26;
const EXECUTION = {
  x: 5,
  y: 180,
  height: 54,
  padLeft: 16,
  padRight: 17,
  baseline: 33,
};
const EVALUATOR = {
  x: 11,
  y: 249,
  height: 53,
  minWidth: 185,
  pad: 32.5,
  baseline: 33.5,
};
const ROWS = {
  x: 56,
  y: 333,
  pitch: 51,
  height: 38,
  labelPad: 15.3,
  dotGap: 16,
  valueGap: 15.5,
  padRight: 15,
};

/**
 * Run timing in ms. The execution flashes and sends a packet to the evaluator, which presses as it lands; the old
 * scores clear 40 ms apart as it presses, then a packet runs to each row, and its dot, value and count follow.
 */
const RUN = {
  flash: 60,
  inAt: 160,
  inFor: 240,
  press: 400,
  clearStep: 40,
  packetsOut: 540,
  speed: 16 / 70,
  dot: 63,
  value: 140,
  count: 800,
};

type ScoreRow = {
  name: Slot;
  value: FormattedValue;
  status: ScoreStatus;
  card: Rect;
  mid: number;
  labelX: number;
  dotX: number;
  valueX: number;
  labelBaseline: number;
  valueBaseline: number;
  /** ms into the run: when the row clears, its branch draws, and its packet lands. */
  clearAt: number;
  drawAt: number;
  drawFor: number;
  arriveAt: number;
  packet: Keyframes;
};

const EXIT = EVALUATOR.y + EVALUATOR.height + 10;
/** ms a packet's branch takes from the trunk to the row. */
const DRAW_FOR = (ROWS.x - TRUNK_X) / RUN.speed;

function executionOf(slot: Slot) {
  return {
    slot,
    card: {
      x: EXECUTION.x,
      y: EXECUTION.y,
      width: EXECUTION.padLeft + CHAR * length(slot.text) + EXECUTION.padRight,
      height: EXECUTION.height,
    },
    textX: EXECUTION.x + EXECUTION.padLeft,
    baseline: EXECUTION.y + EXECUTION.baseline,
  };
}

/** The raised evaluator: at least its minimum width, its name centred. */
function evaluatorOf(slot: Slot) {
  const face: Rect = {
    x: EVALUATOR.x,
    y: EVALUATOR.y,
    width: Math.max(
      EVALUATOR.minWidth,
      CHAR * length(slot.text) + 2 * EVALUATOR.pad,
    ),
    height: EVALUATOR.height,
  };
  return {
    slot,
    face,
    textX: face.x + face.width / 2,
    baseline: face.y + EVALUATOR.baseline,
  };
}

/** The packet from under the evaluator down the trunk and along to row `index`. */
function packetTo(index: number, id: string) {
  const mid = ROWS.y + index * ROWS.pitch + ROWS.height / 2;
  return packetKeyframes(
    `${id}-out-${index}`,
    [
      [TRUNK_X, EXIT],
      [TRUNK_X, mid],
      [ROWS.x, mid],
    ],
    RUN.speed,
  );
}

function rowOf(
  score: EvaluationContent["scores"][number],
  index: number,
  id: string,
): ScoreRow {
  const name = label(score.name, EVALUATION_LIMITS.name);
  const value = formatValue(score.value, {
    format: score.format,
    digits: score.digits,
    max: EVALUATION_LIMITS.value,
  });
  const y = ROWS.y + index * ROWS.pitch;
  const mid = y + ROWS.height / 2;
  const labelX = ROWS.x + ROWS.labelPad;
  const dotX = labelX + CHAR * length(name.text) + ROWS.dotGap;
  const valueX = dotX + ROWS.valueGap;
  const packet = packetTo(index, id);
  const arriveAt = RUN.packetsOut + packet.duration;
  return {
    name,
    value,
    status: statusOf(score),
    card: {
      x: ROWS.x,
      y,
      width: valueX + CHAR * length(value.text) + ROWS.padRight - ROWS.x,
      height: ROWS.height,
    },
    mid,
    labelX,
    dotX,
    valueX,
    labelBaseline: mid + 7.7,
    valueBaseline: mid + 7.2,
    clearAt: RUN.press + index * RUN.clearStep,
    drawAt: arriveAt - DRAW_FOR,
    drawFor: DRAW_FOR,
    arriveAt,
    packet,
  };
}

/** The packet from the execution down into the evaluator. */
function packetInOf(id: string) {
  const inFrom = EXECUTION.y + EXECUTION.height + 2;
  const inTo = EVALUATOR.y + 13;
  return packetKeyframes(
    `${id}-in`,
    [
      [TRUNK_X, inFrom],
      [TRUNK_X, inTo],
    ],
    (inTo - inFrom) / RUN.inFor,
  );
}

const runDurationOf = (rows: ScoreRow[], id: string) =>
  Math.ceil(
    (rows.at(-1)?.arriveAt ?? RUN.packetsOut + packetTo(0, id).duration) +
      RUN.value +
      RUN.count,
  );

const labelOf = (evaluator: Slot, execution: Slot, rows: ScoreRow[]) =>
  `${evaluator.full} scoring ${execution.full}: ${rows.map((row) => `${row.name.full} ${row.value.full}`).join(", ")}`;

export function layoutEvaluation(content: EvaluationContent, id = "lfi") {
  const execution = executionOf(
    label(content.execution, EVALUATION_LIMITS.execution),
  );
  const evaluator = evaluatorOf(
    label(content.evaluator, EVALUATION_LIMITS.evaluator),
  );
  const rows = content.scores
    .slice(0, EVALUATION_LIMITS.scores)
    .map((score, index) => rowOf(score, index, id));
  const viewBox = fitViewBox(
    BASE,
    screenBounds([
      execution.card,
      evaluator.face,
      ...rows.map(({ card }) => card),
    ]),
    { right: 40, bottom: 44 },
  );
  const packetIn = packetInOf(id);
  return {
    projection: PROJECTION,
    viewBox,
    floor: floorFor(viewBox, BASE, EVALUATION_GRID),
    plate: null,
    panelGrid: "fades",
    keyframes: [packetIn, ...rows.map(({ packet }) => packet)],
    runDuration: runDurationOf(rows, id),
    ariaLabel: labelOf(evaluator.slot, execution.slot, rows),
    execution,
    evaluator,
    trunk: {
      x: TRUNK_X,
      top: EXECUTION.y + EXECUTION.height,
      bottom: rows.at(-1)?.mid ?? EXIT + 20,
      cardX: ROWS.x,
    },
    rows,
    run: { ...RUN, packetIn },
  } satisfies SceneLayout & Record<string, unknown>;
}
