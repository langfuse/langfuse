/**
 * Prompt management, traced from langfuse-docs components/home/img/tools/prompt.png (576 × 466): a stack of versions
 * on a trunk, the experiment raised beside it, and a deployment label wired to the live version and the experiment.
 * Plan coordinates. Versions and the tag are set in the sans face, about 0.6em a character; the rest is monospace.
 */

import { packetKeyframes, type Keyframes } from "../../engine/keyframes";
import {
  charWidth,
  fitViewBox,
  floorFor,
  PROJECTION,
  round,
  screenBounds,
  unproject,
  type Point,
  type Rect,
} from "../../engine/projection";
import {
  identifier,
  label,
  length,
  truncate,
  type Slot,
} from "../../engine/slots";
import type { SceneLayout } from "../../engine/Scene";
import { SCENE_FRAMES } from "../frames";
import { PROMPT_DEFAULTS, PROMPT_LIMITS, type PromptContent } from "./content";

const BASE = SCENE_FRAMES.prompt;
const PROMPT_GRID = { cell: 36, u: 21.2, v: 9.2 };
/** The PNG's grid lies on a tilted plate rather than fading out radially; plan units. */
const GRID_PLATE = { x: -78, y: 158, width: 453, height: 353, soften: 10 };

const TRUNK_X = -2.5;
const VERSION = {
  x: -39,
  width: 73,
  height: 55,
  pitch: 72,
  lastY: 331,
  size: 22,
  baseline: 35.4,
  stub: 34,
};
const HERO = {
  x: 74,
  y: 317,
  minWidth: 127,
  height: 53.5,
  depth: 16,
  padLeft: 22.8,
  gap: 11.6,
  padRight: 22.2,
  size: 21,
  baseline: 34.5,
};
const TAG = { height: 22, padX: 3.7, size: 21, baseline: 17.6, drop: 1.9 };
const AUTHOR = {
  gap: 7.4,
  rise: 1.4,
  height: 14.6,
  size: 14,
  padX: 2.5,
  baseline: 12.1,
};
const LABEL = {
  x: 67.5,
  height: 53,
  padLeft: 27.4,
  dotGap: 8.1,
  padRight: 35.5,
  minWidth: 191,
  baseline: 33.3,
  bracket: 12.5,
  drop: 37,
};
const JUNCTION_DROP = 18;

/**
 * Run timing in ms. The versions drop into the stack 80 ms apart, the dashed link draws from its source version to
 * the experiment, which presses as the link lands; its author slides in, then the live version's packet rewires
 * the deployment label.
 */
const RUN = {
  flash: 120,
  versionsAt: 200,
  versionStep: 80,
  dashAt: 420,
  dashFor: 260,
  press: 680,
  authorAt: 760,
  packetAt: 800,
  speed: 0.3,
};

const sansWidth = (text: string, size: number) => 0.6 * size * length(text);

type PromptVersion = {
  slot: Slot;
  card: Rect;
  mid: number;
  live: boolean;
  at: number;
};

/** The stack, oldest on top, ending at the live version on the bottom row. */
function versionsOf(content: PromptContent): PromptVersion[] {
  const names = (
    content.versions.length ? content.versions : PROMPT_DEFAULTS.versions
  ).slice(0, PROMPT_LIMITS.versions);
  const firstY = VERSION.lastY - (names.length - 1) * VERSION.pitch;
  return names.map((name, index) => {
    const y = firstY + index * VERSION.pitch;
    return {
      slot: identifier(name, PROMPT_LIMITS.version),
      card: { x: VERSION.x, y, width: VERSION.width, height: VERSION.height },
      mid: y + VERSION.height / 2,
      live: index === names.length - 1,
      at: RUN.versionsAt + index * RUN.versionStep,
    };
  });
}

/** The version the experiment branches from: its named version, else the one before the live one. */
function sourceOf(content: PromptContent, versions: PromptVersion[]) {
  const live = versions.at(-1)!;
  return (
    versions.find(
      ({ slot }) => slot.full === content.experiment.version.trim(),
    ) ??
    versions.at(-2) ??
    live
  );
}

/** The raised experiment: its version and tag side by side, the face growing to fit them. */
function heroOf(content: PromptContent) {
  const version = identifier(content.experiment.version, PROMPT_LIMITS.version);
  const tag = identifier(content.experiment.tag, PROMPT_LIMITS.tag);
  const tagWidth = sansWidth(tag.text, TAG.size) + 2 * TAG.padX;
  const versionWidth = sansWidth(version.text, HERO.size);
  const face: Rect = {
    x: HERO.x,
    y: HERO.y,
    width: Math.max(
      HERO.minWidth,
      HERO.padLeft + versionWidth + HERO.gap + tagWidth + HERO.padRight,
    ),
    height: HERO.height,
  };
  const tagRect: Rect = {
    x: face.x + HERO.padLeft + versionWidth + HERO.gap,
    y: face.y + (face.height - TAG.height) / 2 + TAG.drop,
    width: tagWidth,
    height: TAG.height,
  };
  return { version, tag, face, tagRect };
}

/** The block's footprint is its top face moved down `depth` screen px; its socket sits mid-way along the front edge. */
function socketOf(face: Rect): Point {
  const [shiftU, shiftV] = unproject([0, HERO.depth], PROJECTION);
  return [
    round(face.x + shiftU + face.width / 2),
    round(face.y + face.height + shiftV),
  ];
}

/** The author's chip just off the block's front corner. */
function authorOf(content: PromptContent, face: Rect) {
  const full = content.author.trim();
  const slot: Slot = { text: truncate(full, PROMPT_LIMITS.author), full };
  const rect: Rect = {
    x: face.x + face.width + AUTHOR.gap,
    y: face.y + face.height - AUTHOR.rise,
    width: length(slot.text) * charWidth(AUTHOR.size) + 2 * AUTHOR.padX,
    height: AUTHOR.height,
  };
  return { slot, rect };
}

/** The deployment label below the block's socket, its status dot after the text. */
function deploymentOf(content: PromptContent, socket: Point) {
  const slot = label(content.label, PROMPT_LIMITS.label);
  const y = socket[1] + LABEL.drop;
  const textEnd = LABEL.x + LABEL.padLeft + charWidth(20) * length(slot.text);
  const card: Rect = {
    x: LABEL.x,
    y,
    width: Math.max(
      LABEL.minWidth,
      textEnd + LABEL.dotGap - LABEL.x + LABEL.padRight,
    ),
    height: LABEL.height,
  };
  const dot: Point = [textEnd + LABEL.dotGap, y + LABEL.height / 2 + 0.8];
  return { slot, card, dot };
}

/** The live version's wire: down the trunk, across to the block's socket, on to the label, with a packet per leg. */
function wiringOf(
  live: PromptVersion,
  socket: Point,
  labelY: number,
  id: string,
) {
  const liveOut: Point = [TRUNK_X, live.card.y + live.card.height];
  const junction = liveOut[1] + JUNCTION_DROP;
  const toBlock = packetKeyframes(
    `${id}-to-block`,
    [liveOut, [TRUNK_X, junction], [socket[0], junction], socket],
    RUN.speed,
  );
  const toLabel = packetKeyframes(
    `${id}-to-label`,
    [socket, [socket[0], labelY]],
    RUN.speed,
  );
  const reachesBlock = RUN.packetAt + toBlock.duration;
  return {
    liveOut,
    path: `M${liveOut[0]} ${liveOut[1]}V${junction}H${socket[0]}M${socket[0]} ${socket[1]}V${labelY}`,
    toBlock,
    toLabel,
    reachesBlock,
    reachesLabel: reachesBlock + toLabel.duration,
  };
}

/** The trunk: a stub above the first version, then a link between each pair. */
function trunkPathOf(versions: PromptVersion[]) {
  return [
    `M${TRUNK_X} ${versions[0]!.card.y - VERSION.stub}V${versions[0]!.card.y}`,
    ...versions
      .slice(1)
      .map(
        ({ card }, i) =>
          `M${TRUNK_X} ${versions[i]!.card.y + VERSION.height}V${card.y}`,
      ),
  ].join("");
}

const frameOf = (cards: Rect[]) =>
  fitViewBox(BASE, screenBounds(cards), { right: 40, bottom: 30 });

const labelOf = (
  versions: PromptVersion[],
  hero: ReturnType<typeof heroOf>,
  author: Slot,
  deployment: Slot,
) =>
  `Prompt versions ${versions.map(({ slot }) => slot.full).join(", ")}; ${hero.version.full} (${hero.tag.full}) by ${author.full}; ${deployment.full} serves ${versions.at(-1)!.slot.full}`;

export function layoutPrompt(content: PromptContent, id = "lfi") {
  const versions = versionsOf(content);
  const source = sourceOf(content, versions);
  const hero = heroOf(content);
  const { face, tagRect, tag } = hero;
  const socket = socketOf(face);
  const author = authorOf(content, face);
  const deployment = deploymentOf(content, socket);
  const wiring = wiringOf(versions.at(-1)!, socket, deployment.card.y, id);
  const viewBox = frameOf([
    ...versions.map(({ card }) => card),
    face,
    author.rect,
    deployment.card,
  ]);
  const keyframes: Keyframes[] = [wiring.toBlock, wiring.toLabel];
  return {
    projection: PROJECTION,
    viewBox,
    floor: floorFor(viewBox, BASE, PROMPT_GRID),
    plate: null,
    panelGrid: "fades",
    keyframes,
    runDuration: Math.ceil(wiring.reachesLabel + 500),
    ariaLabel: labelOf(versions, hero, author.slot, deployment.slot),
    gridPlate: GRID_PLATE,
    trunk: { x: TRUNK_X, path: trunkPathOf(versions) },
    versions,
    versionText: { size: VERSION.size, baseline: VERSION.baseline },
    dash: `M${source.card.x + source.card.width} ${source.mid}H${socket[0]}V${face.y}`,
    hero: {
      face,
      version: hero.version,
      versionX: face.x + HERO.padLeft,
      baseline: face.y + HERO.baseline,
      size: HERO.size,
      depth: HERO.depth,
    },
    tag: {
      slot: tag,
      rect: tagRect,
      textX: tagRect.x + TAG.padX,
      baseline: tagRect.y + TAG.baseline,
      size: TAG.size,
    },
    author: {
      slot: author.slot,
      rect: author.rect,
      textX: author.rect.x + AUTHOR.padX,
      baseline: author.rect.y + AUTHOR.baseline,
      size: AUTHOR.size,
    },
    wire: wiring.path,
    sockets: { liveOut: wiring.liveOut, block: socket },
    deployment: {
      slot: deployment.slot,
      card: deployment.card,
      textX: LABEL.x + LABEL.padLeft,
      baseline: deployment.card.y + LABEL.baseline,
      dot: deployment.dot,
      bracket: LABEL.bracket,
    },
    run: {
      ...RUN,
      toBlock: wiring.toBlock,
      toLabel: wiring.toLabel,
      reachesBlock: wiring.reachesBlock,
      reachesLabel: wiring.reachesLabel,
    },
  } satisfies SceneLayout & Record<string, unknown>;
}
