/**
 * Agent sessions, drawn for the empty states' style rather than traced from a PNG: a raised agent block, a trunk down
 * its side, and one span card per tool call, with a dashed slot for the next one. Plan coordinates; the frame fits
 * the drawing, like the empty states' kit.
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
} from "../../engine/projection";
import type { SceneLayout } from "../../engine/Scene";
import { identifier, type Slot } from "../../engine/slots";
import { AGENTS_LIMITS, type AgentsContent } from "./content";

const HERO = {
  height: 40,
  depth: 14,
  pad: 12,
  gap: 10,
  size: 16,
  minWidth: 150,
  promptPadX: 6,
};
const TRUNK_X = 18;
const ROWS = {
  x: 42,
  /** Low enough that the rows' right ends, which the -20° axis lifts, clear the hero's sides. */
  y: 76,
  pitch: 40,
  height: 30,
  width: 200,
  chip: 13,
  chipPadX: 5,
  pad: 9,
  gap: 9,
  bar: 64,
  barHeight: 8,
};
const PAD = { x: 20, top: 30, bottom: 40 };
const GRID = { cell: 36, u: 0, v: 0 };
const PROMPT = ">_";

/**
 * Run timing in ms. The agent stays; the spans clear 30 ms apart, then each tool call leaves the agent as a packet,
 * 380 ms after the last, and its span rises in as it lands, its dot a beat later; the slot for the next call fades
 * in once the last has landed. The agent's name changes each run.
 */
const RUN = {
  clearStep: 30,
  name: 200,
  nameFor: 220,
  firstCall: 220,
  callStep: 380,
  speed: 0.3,
  dot: 80,
  next: 160,
  press: 200,
};

type AgentsRow = {
  tool: Slot;
  card: Rect;
  mid: number;
  chip: { x: number; y: number };
  bar: Rect;
  time: Rect;
  /** The status dot, r its halo's radius. */
  dot: { x: number; y: number; r: number };
  clearAt: number;
  departAt: number;
  arriveAt: number;
  packet: Keyframes;
};

const CHIP_HEIGHT = chipHeight(ROWS.chip);
/** The status dot's halo radius; a row's time bar stops at its edge. */
const DOT_HALO = 6;
const PROMPT_WIDTH = chipWidth(PROMPT, HERO.size, HERO.promptPadX);

/** The agents to cycle through, with a stand-in when none are given. */
function agentsOf(content: AgentsContent) {
  const listed: AgentsContent["agents"] = (
    content.agents.length > 0 ? content.agents : [{ name: "agent" }]
  ).slice(0, AGENTS_LIMITS.agents);
  return {
    agents: listed.map(({ name }) => identifier(name, AGENTS_LIMITS.agent)),
    logos: listed.map(({ logo }) => logo),
  };
}

/** The hero's face, wide enough for the prompt chip and the longest agent name. */
function faceOf(agents: Slot[]): Rect {
  const longest = Math.max(...agents.map(({ text }) => [...text].length));
  return {
    x: 0,
    y: 0,
    width: Math.max(
      HERO.minWidth,
      round(
        HERO.pad +
          PROMPT_WIDTH +
          HERO.gap +
          longest * charWidth(HERO.size) +
          HERO.pad,
      ),
    ),
    height: HERO.height,
  };
}

/** One tool call's span card, and the packet that carries it down the trunk. */
function rowOf(
  tool: AgentsContent["tools"][number],
  index: number,
  face: Rect,
  id: string,
): AgentsRow {
  const y = ROWS.y + index * ROWS.pitch;
  const mid = y + ROWS.height / 2;
  const slot = identifier(tool.name, AGENTS_LIMITS.tool);
  const chip = { x: ROWS.x + ROWS.pad, y: round(mid - CHIP_HEIGHT / 2) };
  const barX = round(
    chip.x + chipWidth(slot.text, ROWS.chip, ROWS.chipPadX) + ROWS.gap,
  );
  const share = Math.min(1, Math.max(0.08, tool.share ?? 0.3));
  const timeX = barX + ROWS.bar + 8;
  const dot = { x: ROWS.x + ROWS.width - 14, y: mid, r: DOT_HALO };
  const departAt = RUN.firstCall + index * RUN.callStep;
  const packet = packetKeyframes(
    `${id}-call-${index}`,
    [
      [TRUNK_X, face.height],
      [TRUNK_X, mid],
      [ROWS.x, mid],
    ],
    RUN.speed,
  );
  return {
    tool: slot,
    card: { x: ROWS.x, y, width: ROWS.width, height: ROWS.height },
    mid,
    chip,
    bar: {
      x: barX,
      y: mid - ROWS.barHeight / 2,
      width: ROWS.bar,
      height: ROWS.barHeight,
    },
    time: {
      x: timeX,
      y: mid - ROWS.barHeight / 2,
      width: Math.min(round(10 + share * 38), dot.x - dot.r - timeX),
      height: ROWS.barHeight,
    },
    dot,
    clearAt: index * RUN.clearStep,
    departAt,
    arriveAt: departAt + packet.duration,
    packet,
  };
}

/** The dashed slot for the next call, fading in once the last call has landed. */
function nextOf(rows: AgentsRow[]) {
  const y = ROWS.y + rows.length * ROWS.pitch;
  return {
    card: { x: ROWS.x, y, width: ROWS.width, height: ROWS.height },
    mid: y + ROWS.height / 2,
    at: (rows.at(-1)?.arriveAt ?? RUN.firstCall) + RUN.next,
  };
}

function heroOf(face: Rect) {
  const promptHeight = chipHeight(HERO.size);
  return {
    face,
    depth: HERO.depth,
    prompt: {
      x: HERO.pad,
      y: round((HERO.height - promptHeight) / 2),
      slot: { text: PROMPT, full: PROMPT },
      padX: HERO.promptPadX,
      width: PROMPT_WIDTH,
      height: promptHeight,
    },
    nameX: HERO.pad + PROMPT_WIDTH + HERO.gap,
    baseline: 26,
    size: HERO.size,
  };
}

/** The trunk down the hero's side with a branch to each span, and the dashed wire to the next slot. */
function wiresOf(face: Rect, rows: AgentsRow[], next: { mid: number }) {
  const last = rows.at(-1);
  return {
    trunk: [
      `M${TRUNK_X} ${face.height}V${last?.mid ?? face.height + 20}`,
      ...rows.map(({ mid }) => `M${TRUNK_X} ${mid}H${ROWS.x}`),
    ].join(""),
    nextWire: `M${TRUNK_X} ${last?.mid ?? face.height}V${next.mid}H${ROWS.x}`,
  };
}

const labelOf = (agent: Slot, rows: AgentsRow[]) =>
  `A coding agent's session traced in Langfuse: ${agent.full} calls ${rows.map(({ tool }) => tool.full).join(", ")}, one span each`;

export function layoutAgents(content: AgentsContent, id = "lfi") {
  const { agents, logos } = agentsOf(content);
  const face = faceOf(agents);
  const rows = content.tools
    .slice(0, AGENTS_LIMITS.tools)
    .map((tool, index) => rowOf(tool, index, face, id));
  const next = nextOf(rows);
  const active =
    content.active === undefined
      ? undefined
      : activeIndexOf(content.active, 0, agents.length);
  const labels = agents.map((agent) => labelOf(agent, rows));
  const { viewBox, offset } = fitFrame(
    [face, ...rows.map(({ card }) => card), next.card],
    PAD,
  );
  return {
    projection: PROJECTION,
    viewBox,
    floor: floorFor(viewBox, viewBox, GRID, { side: 0, top: 0 }),
    plate: null,
    panelGrid: "fades",
    keyframes: rows.map(({ packet }) => packet),
    runDuration: Math.ceil(next.at + 400),
    ariaLabel: labels[active ?? 0]!,
    offset,
    agents,
    logos,
    labels,
    active,
    hero: heroOf(face),
    ...wiresOf(face, rows, next),
    rows,
    next,
    chip: { size: ROWS.chip, padX: ROWS.chipPadX },
    run: RUN,
  } satisfies SceneLayout & Record<string, unknown>;
}
