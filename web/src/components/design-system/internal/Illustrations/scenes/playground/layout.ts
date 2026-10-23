/**
 * Playground, traced from langfuse-docs components/home/img/tools/playground.png (428 × 376): a system and a user
 * message on a tilted plate, wired into two raised model blocks, and the active model's reply wrapped underneath.
 * The PNG is drawn at 0.89× the shared projection; plan units are the same 36-unit grid cells.
 */

import { packetKeyframes, type Keyframes } from "../../engine/keyframes";
import {
  floorFor,
  PROJECTION,
  round,
  type Projection,
  type Rect,
} from "../../engine/projection";
import type { SceneLayout } from "../../engine/Scene";
import { identifier, truncate, type Slot } from "../../engine/slots";
import { SCENE_FRAMES } from "../frames";
import { PLAYGROUND_LIMITS, type PlaygroundContent } from "./content";

const BASE = SCENE_FRAMES.playground;
const GRID = { cell: 36, u: 34.7, v: 13.7 };
const PLAYGROUND_PROJECTION = PROJECTION.map(
  (n) => Math.round(n * 0.89 * 1e4) / 1e4,
) as unknown as Projection;

const PANEL_INSET = { side: 32, top: 96 };
const PLATE: Rect = { x: -116, y: 158.7, width: 517.1, height: 358.3 };
const MESSAGES = {
  x: -82,
  y: 188.8,
  width: 367,
  height: 34.3,
  pitch: 41.5,
  padLeft: 16.5,
  baseline: 22,
  fontSize: 12.8,
};
const MODELS = {
  x: -75.5,
  y: 291.6,
  width: 145.5,
  height: 53.2,
  pitch: 162,
  depth: 14.5,
  baseline: 33.8,
  fontSize: 17.5,
  wireAt: [31.2, 70.5],
};
/** The fork from the user message: the first model drops straight down, the rest branch off at `branchY`. */
const FORK = { branchY: 276 };
const REPLY = {
  x: -74.8,
  top: 377.5,
  baseline: 396.3,
  pitch: 20.1,
  fontSize: 13.5,
  fade: [1, 1, 1, 1, 0.35, 0.25, 0.15],
};

/**
 * Run timing in ms. The messages fade in, a packet forks from the user message to each model, each model presses as
 * its packet lands, a packet runs down from it, and the active model's reply types out as that packet arrives.
 */
const RUN = {
  /** ms between the models landing in a first build */
  landStep: 70,
  system: 160,
  user: 240,
  fork: 340,
  /** ms between a model's press and its packet leaving for the reply */
  downAfter: 140,
  /** Per model: ms between line starts and ms per character; later models are a little slower. */
  lineStagger: [110, 140],
  perChar: [10, 12],
  speed: 16 / 70,
};

/** A message as written (it's quoted text, so never re-cased), cut at the end. */
function message(text: string): Slot {
  const full = text.trim();
  return { text: truncate(full, PLAYGROUND_LIMITS.message, "end"), full };
}

/** The wires from the user message: straight down to the first model, then a branch across to the others. */
function forkPath(wires: number[], userBottom: number): string {
  const [first, ...rest] = wires;
  if (first === undefined) return "";
  const down = `M${first} ${userBottom}V${MODELS.y}`;
  const last = rest.at(-1);
  if (last === undefined) return down;
  return [
    down,
    `M${first} ${FORK.branchY}H${last}`,
    ...rest.map((x) => `M${x} ${FORK.branchY}V${MODELS.y}`),
  ].join("");
}

function wrapParagraph(paragraph: string, lineChars: number): string[] {
  const words = paragraph.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    let rest = word;
    while ([...rest].length > lineChars) {
      if (line) lines.push(line);
      lines.push([...rest].slice(0, lineChars).join(""));
      rest = [...rest].slice(lineChars).join("");
      line = "";
    }
    const next = line ? `${line} ${rest}` : rest;
    if ([...next].length <= lineChars) line = next;
    else {
      lines.push(line);
      line = rest;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Greedy word wrap that keeps line breaks; long words are broken, and text past the last line ends in an ellipsis. */
export function wrapPlaygroundReply(
  text: string,
  lineChars: number,
  maxLines: number,
): string[] {
  const lines = text
    .trim()
    .split(/\n+/)
    .flatMap((paragraph) => wrapParagraph(paragraph, lineChars));
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = truncate(
    `${kept[maxLines - 1]} ${lines[maxLines]}`,
    lineChars,
    "end",
  );
  return kept;
}

function messagesOf(content: PlaygroundContent) {
  return [message(content.system), message(content.user)].map(
    (slot, index) => ({
      slot,
      card: {
        x: MESSAGES.x,
        y: MESSAGES.y + index * MESSAGES.pitch,
        width: MESSAGES.width,
        height: MESSAGES.height,
      },
      textX: MESSAGES.x + MESSAGES.padLeft,
      baseline: MESSAGES.y + index * MESSAGES.pitch + MESSAGES.baseline,
    }),
  );
}

/** Each model's block side by side, its wrapped reply and the packet down from it to the reply. */
function placedModelsOf(content: PlaygroundContent, id: string) {
  return content.models
    .slice(0, PLAYGROUND_LIMITS.models)
    .map((model, index) => {
      const face = {
        x: MODELS.x + index * MODELS.pitch,
        y: MODELS.y,
        width: MODELS.width,
        height: MODELS.height,
      };
      const wireX = round(face.x + (MODELS.wireAt[index] ?? face.width / 2));
      return {
        name: identifier(model.name, PLAYGROUND_LIMITS.model),
        face,
        wireX,
        lines: wrapPlaygroundReply(
          model.output,
          PLAYGROUND_LIMITS.lineChars,
          PLAYGROUND_LIMITS.lines,
        ).map((line) => ({ text: line, full: line })),
        down: packetKeyframes(
          `${id}-down-${index}`,
          [
            [wireX, face.y + face.height],
            [wireX, REPLY.top],
          ],
          RUN.speed,
        ),
        lineStagger: RUN.lineStagger[index] ?? RUN.lineStagger.at(-1)!,
        perChar: RUN.perChar[index] ?? RUN.perChar.at(-1)!,
      };
    });
}

/** A packet per model along the fork: straight down to the first, across the branch to the rest. */
function forkPacketsOf(wires: number[], userBottom: number, id: string) {
  const [firstWire = 0] = wires;
  return wires.map((wireX, index) =>
    packetKeyframes(
      `${id}-fork-${index}`,
      index === 0
        ? [
            [wireX, userBottom],
            [wireX, MODELS.y],
          ]
        : [
            [firstWire, FORK.branchY],
            [wireX, FORK.branchY],
            [wireX, MODELS.y],
          ],
      RUN.speed,
    ),
  );
}

/** Each step starts when the one before it lands: the press, the packet down, then the reply. */
function timedModelsOf(
  placed: ReturnType<typeof placedModelsOf>,
  forkPackets: Keyframes[],
): PlaygroundModelLayout[] {
  return placed.map((model, index) => {
    const pressAt = RUN.fork + (forkPackets[index]?.duration ?? 0);
    const downAt = pressAt + RUN.downAfter;
    return { ...model, pressAt, downAt, replyAt: downAt + model.down.duration };
  });
}

/** Done when the last reply line has typed out, plus a beat. */
function runDurationOf(models: PlaygroundModelLayout[]) {
  const replyEnds = models.map(({ lines, lineStagger, perChar, replyAt }) =>
    Math.max(
      replyAt,
      ...lines.map(
        (line, i) =>
          replyAt + i * lineStagger + [...line.text].length * perChar,
      ),
    ),
  );
  return Math.ceil(Math.max(...replyEnds) + 100);
}

const labelOf = (user: Slot, models: PlaygroundModelLayout[]) =>
  `Playground: "${user.full}" sent to ${models.map(({ name }) => name.full).join(" and ")}`;

export function layoutPlayground(content: PlaygroundContent, id = "lfi") {
  const messages = messagesOf(content);
  const userBottom = MESSAGES.y + MESSAGES.pitch + MESSAGES.height;
  const placed = placedModelsOf(content, id);
  const wires = placed.map(({ wireX }) => wireX);
  const forkPackets = forkPacketsOf(wires, userBottom, id);
  const models = timedModelsOf(placed, forkPackets);
  return {
    projection: PLAYGROUND_PROJECTION,
    viewBox: BASE,
    floor: floorFor(BASE, BASE, GRID, PANEL_INSET, PLAYGROUND_PROJECTION),
    plate: PLATE,
    panelGrid: "stops",
    keyframes: [...forkPackets, ...models.map(({ down }) => down)],
    runDuration: runDurationOf(models),
    ariaLabel: labelOf(messages[1]!.slot, models),
    messages,
    messageFont: MESSAGES.fontSize,
    models,
    modelText: {
      baseline: MODELS.baseline,
      fontSize: MODELS.fontSize,
      depth: MODELS.depth,
    },
    fork: forkPath(wires, userBottom),
    forkPackets,
    reply: REPLY,
    run: RUN,
  } satisfies SceneLayout & Record<string, unknown>;
}

type PlaygroundModelLayout = {
  name: Slot;
  face: Rect;
  wireX: number;
  lines: Slot[];
  pressAt: number;
  down: Keyframes;
  downAt: number;
  /** When its reply starts typing: as its packet reaches the reply. */
  replyAt: number;
  lineStagger: number;
  perChar: number;
};
