/**
 * Skills, drawn for the empty states' style: the skill raised as a file panel (its version, name and label above the
 * files it holds), a trunk down its side, and one card per way it's used: a coding agent's install, an app's fetch,
 * a chat agent's tool call. Plan coordinates; the frame fits the drawing.
 */

import { packetKeyframes, type Keyframes } from "../../engine/keyframes";
import {
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
import { identifier, type Slot } from "../../engine/slots";
import { SKILLS_LIMITS, type SkillsContent } from "./content";

const HERO = {
  header: 40,
  /** The name's baseline in the header. */
  baseline: 26,
  depth: 14,
  pad: 12,
  gap: 10,
  size: 16,
  tag: 13,
  tagPadX: 5,
  chipPadX: 6,
  minWidth: 200,
};
const FILES = { pitch: 22, size: 13, icon: 9, iconGap: 8, padBottom: 10 };
const TRUNK_X = 18;
const TARGETS = {
  x: 42,
  /** The cards sit this far below the face, clear of the hero's sides, which hang its depth under it. */
  gap: 36,
  pitch: 40,
  height: 30,
  pad: 9,
  size: 13,
  chip: 12,
  chipPadX: 4,
  chipGap: 8,
  versionGap: 12,
  dotGap: 16,
};
const PAD = { x: 20, top: 30, bottom: 40 };
const GRID = { cell: 36, u: 0, v: 0 };

/**
 * Run timing in ms, the deploy: the skill's files clear and slide back in, in reading order, as one new version. As
 * the last lands the skill presses and the label (production) moves to it, then the version travels to each install,
 * 160 ms apart, and lands there with its status a beat later, as an install picks up what its label points to.
 */
const RUN = {
  clearStep: 30,
  files: 120,
  fileStep: 40,
  publish: 60,
  tag: 60,
  send: 140,
  sendStep: 160,
  speed: 0.3,
  dot: 80,
  /** After the last status lands, before the run counts as done. */
  hold: 400,
};

type SkillsFile = {
  path: Slot;
  icon: Rect;
  textX: number;
  baseline: number;
  at: number;
  clearAt: number;
};

type SkillsTarget = {
  via: Slot;
  path: Slot;
  card: Rect;
  chip: { x: number; y: number };
  mid: number;
  textX: number;
  versionX: number;
  baseline: number;
  dot: { x: number; y: number };
  clearAt: number;
  departAt: number;
  arriveAt: number;
  packet: Keyframes;
};

const VERSION_CHIP_HEIGHT = chipHeight(HERO.size);
const VIA_CHIP_HEIGHT = chipHeight(TARGETS.chip);
const TAG_CHIP_HEIGHT = chipHeight(HERO.tag);

/** The header's three parts left to right, and the face wide enough for them and the longest file. */
function faceOf(version: Slot, name: Slot, tag: Slot, files: Slot[]) {
  const nameX =
    HERO.pad + chipWidth(version.text, HERO.size, HERO.chipPadX) + HERO.gap;
  const tagX = round(nameX + textWidth(name.text, HERO.size) + HERO.gap);
  const headerEnd =
    tagX + chipWidth(tag.text, HERO.tag, HERO.tagPadX) + HERO.pad;
  const longestFile = Math.max(
    0,
    ...files.map(({ text }) => textWidth(text, FILES.size)),
  );
  const filesEnd =
    HERO.pad + FILES.icon + FILES.iconGap + longestFile + HERO.pad;
  const face: Rect = {
    x: 0,
    y: 0,
    width: round(Math.max(HERO.minWidth, headerEnd, filesEnd)),
    height: HERO.header + files.length * FILES.pitch + FILES.padBottom,
  };
  return { face, nameX: round(nameX), tagX };
}

/** One bundled file's row on the face, its icon and path, sliding in after the one above. */
function fileOf(path: Slot, index: number): SkillsFile {
  const top = HERO.header + index * FILES.pitch;
  const mid = top + FILES.pitch / 2;
  return {
    path,
    icon: {
      x: HERO.pad,
      y: round(mid - FILES.icon * 0.6),
      width: FILES.icon,
      height: round(FILES.icon * 1.2),
    },
    textX: HERO.pad + FILES.icon + FILES.iconGap,
    baseline: round(mid + FILES.size * 0.36),
    at: RUN.files + index * RUN.fileStep,
    clearAt: index * RUN.clearStep,
  };
}

/** One use's card (how it gets there, then what reads it), and the packet that carries the version to it. */
function targetOf(
  { via, path }: { via: Slot; path: Slot },
  index: number,
  {
    face,
    width,
    textX,
    departAt,
    id,
  }: { face: Rect; width: number; textX: number; departAt: number; id: string },
): SkillsTarget {
  const y = face.height + TARGETS.gap + index * TARGETS.pitch;
  const mid = y + TARGETS.height / 2;
  const dotX = TARGETS.x + width - TARGETS.dotGap;
  const packet = packetKeyframes(
    `${id}-use-${index}`,
    [
      [TRUNK_X, face.height],
      [TRUNK_X, mid],
      [TARGETS.x, mid],
    ],
    RUN.speed,
  );
  return {
    via,
    path,
    card: { x: TARGETS.x, y, width, height: TARGETS.height },
    chip: {
      x: TARGETS.x + TARGETS.pad,
      y: round(mid - VIA_CHIP_HEIGHT / 2),
    },
    mid,
    textX,
    versionX: dotX - TARGETS.dotGap,
    baseline: round(mid + TARGETS.size * 0.36),
    dot: { x: dotX, y: mid },
    clearAt: index * RUN.clearStep,
    departAt,
    arriveAt: departAt + packet.duration,
    packet,
  };
}

/** Where every use's text starts, past the widest chip, and the card width that fits the longest text, the version and its dot. */
function targetColumnsOf(uses: { via: Slot; path: Slot }[], version: Slot) {
  const chips = Math.max(
    0,
    ...uses.map(({ via }) =>
      chipWidth(via.text, TARGETS.chip, TARGETS.chipPadX),
    ),
  );
  const longest = Math.max(
    0,
    ...uses.map(({ path }) => textWidth(path.text, TARGETS.size)),
  );
  const textOffset = TARGETS.pad + chips + TARGETS.chipGap;
  return {
    textX: round(TARGETS.x + textOffset),
    width: round(
      textOffset +
        longest +
        TARGETS.versionGap +
        textWidth(version.text, TARGETS.size) +
        2 * TARGETS.dotGap,
    ),
  };
}

/** The trunk down the hero's side with a branch to each use. */
const trunkOf = (face: Rect, targets: SkillsTarget[]) =>
  [
    targets.length > 0
      ? `M${TRUNK_X} ${face.height}V${targets.at(-1)!.mid}`
      : "",
    ...targets.map(({ mid }) => `M${TRUNK_X} ${mid}H${TARGETS.x}`),
  ].join("");

const labelOf = (
  name: Slot,
  version: Slot,
  tag: Slot,
  files: SkillsFile[],
  targets: SkillsTarget[],
) =>
  `A skill in Langfuse: ${name.full} ${version.full}, with ${files.map(({ path }) => path.full).join(", ")}, moves to ${tag.full} and reaches ${targets.map(({ via, path }) => `${path.full} (${via.full})`).join(", ")}`;

/** The content as slots: names and paths as written, the version as v3, each capped at its limit. */
function slotsOf(content: SkillsContent) {
  return {
    name: identifier(content.name, SKILLS_LIMITS.name),
    version: identifier(
      `v${Math.max(1, Math.round(content.version))}`,
      SKILLS_LIMITS.version,
    ),
    tag: identifier(content.label, SKILLS_LIMITS.label),
    paths: content.files
      .slice(0, SKILLS_LIMITS.files)
      .map((file) => identifier(file, SKILLS_LIMITS.file)),
    uses: content.uses.slice(0, SKILLS_LIMITS.uses).map((use) => ({
      via: identifier(use.via, SKILLS_LIMITS.via),
      path: identifier(use.target, SKILLS_LIMITS.target),
    })),
  };
}

/** The raised skill's header: the version chip, the name, and the label chip that pops as it's deployed. */
function heroOf({
  face,
  nameX,
  tagX,
  version,
  name,
  tag,
  pressAt,
}: {
  face: Rect;
  nameX: number;
  tagX: number;
  version: Slot;
  name: Slot;
  tag: Slot;
  pressAt: number;
}) {
  return {
    face,
    depth: HERO.depth,
    pressAt,
    version,
    versionChip: {
      x: HERO.pad,
      y: round((HERO.header - VERSION_CHIP_HEIGHT) / 2),
      padX: HERO.chipPadX,
    },
    name,
    nameX,
    baseline: HERO.baseline,
    size: HERO.size,
    tag,
    tagChip: {
      x: tagX,
      y: round((HERO.header - TAG_CHIP_HEIGHT) / 2),
      padX: HERO.tagPadX,
      size: HERO.tag,
      at: pressAt + RUN.tag,
    },
  };
}

export function layoutSkills(content: SkillsContent, id = "lfi") {
  const { name, version, tag, paths, uses } = slotsOf(content);
  const { face, nameX, tagX } = faceOf(version, name, tag, paths);
  const files = paths.map(fileOf);
  const pressAt = (files.at(-1)?.at ?? RUN.files) + RUN.publish;
  const { textX, width } = targetColumnsOf(uses, version);
  const targets = uses.map((use, index) =>
    targetOf(use, index, {
      face,
      width,
      textX,
      departAt: pressAt + RUN.send + index * RUN.sendStep,
      id,
    }),
  );
  const { viewBox, offset } = fitFrame(
    [face, ...targets.map(({ card }) => card)],
    PAD,
  );
  const lastArrival = targets.at(-1)?.arriveAt ?? pressAt;
  return {
    projection: PROJECTION,
    viewBox,
    floor: floorFor(viewBox, viewBox, GRID, { side: 0, top: 0 }),
    plate: null,
    panelGrid: "fades",
    keyframes: targets.map(({ packet }) => packet),
    runDuration: Math.ceil(lastArrival + RUN.dot + RUN.hold),
    ariaLabel: labelOf(name, version, tag, files, targets),
    offset,
    hero: heroOf({ face, nameX, tagX, version, name, tag, pressAt }),
    files,
    fileSize: FILES.size,
    trunk: trunkOf(face, targets),
    targets,
    targetSize: TARGETS.size,
    viaChip: { size: TARGETS.chip, padX: TARGETS.chipPadX },
    run: RUN,
  } satisfies SceneLayout & Record<string, unknown>;
}
