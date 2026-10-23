"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Block } from "../engine/Block";
import { Chip } from "../engine/Chip";
import {
  charWidth,
  floorFor,
  planTransform,
  project,
  PROJECTION,
  round,
  type Floor,
  type Point,
  type Rect,
  type ViewBox,
} from "../engine/projection";
import { Frame, useIllustrationId } from "../engine/Frame";
import scene from "../engine/Scene.module.css";
import { identifier } from "../engine/slots";
import { usePlayback, type PlayTrigger } from "../engine/usePlayback";
import { DESIGNS, type DrawingName, type Shape, type Tone } from "./designs";
import styles from "./Drawing.module.css";

/** What each motion preset does: when the entrance plays, when the idle loop runs, when the hero lifts. */
const MOTION = {
  /** Builds once when it scrolls into view; moves only while hovered. */
  subtle: { entrance: "inView", idle: "hover", lift: "hover" },
  /** Still until hovered; each hover rebuilds it. */
  hover: { entrance: "hover", idle: "hover", lift: "hover" },
  off: { entrance: "off", idle: "off", lift: "off" },
} as const satisfies Record<
  string,
  { entrance: PlayTrigger; idle: "hover" | "off"; lift: "hover" | "off" }
>;

/** The least ms between entrances, so a hover that leaves and comes back doesn't stutter. */
const ENTRANCE_GAP = 700;

const GRID = { cell: 36, u: 0, v: 0 };
const PAD = { x: 22, top: 30, bottom: 26 };

/*
 * The entrance runs in three beats, timed in Drawing.module.css: the hero lands; what exists emerges from it; the
 * dashed outlines of what's still to come ghost in last. Each part gets its place in a beat: --ripple (ms) grows with
 * its distance from the hero, --from-x/y points back at the hero, and a card's contents enter with it.
 */
/** ms of ripple per plan unit between a part and the hero, and its cap */
const RIPPLE = { perUnit: 1.2, max: 240 };
/** ms between parts of one object (a card's contents, the hero's face) that enter the same way */
const STAGGER = 40;
/** plan units a part travels out from the hero as it emerges */
const TRAVEL = 6;

export type DrawingMotion = keyof typeof MOTION;

type DrawingProps = {
  drawing: DrawingName;
  motion: DrawingMotion;
  backdrop: "grid" | "panel" | "none";
  accent: "none" | "highlight";
};

const shift = ([x, y]: Point, [dx, dy]: Point): Point => [x + dx, y + dy];

const corners = ({ x, y, width, height }: Rect): Point[] => [
  [x, y],
  [x + width, y],
  [x + width, y + height],
  [x, y + height],
];

const square = (at: Point, r: number, [dx, dy]: Point): Point[] => [
  shift(at, [dx - r, dy - r]),
  shift(at, [dx + r, dy + r]),
];

function chipSize(shape: { text: string; size?: number }) {
  const size = shape.size ?? 16;
  return {
    size,
    width: [...shape.text].length * charWidth(size) + 12,
    height: Math.round(size * 1.45),
  };
}

const EXTENTS: {
  [K in Shape["kind"]]: (
    shape: Extract<Shape, { kind: K }>,
    offset: Point,
    nestedExtent: (shape: Shape, offset: Point) => Point[],
  ) => Point[];
} = {
  card: (shape, offset) =>
    corners(shape.rect).map((point) => shift(point, offset)),
  bar: (shape, offset) =>
    corners(shape.rect).map((point) => shift(point, offset)),
  block: (shape, offset, nestedExtent) => [
    ...corners(shape.rect).map((point) => shift(point, offset)),
    ...(shape.on ?? []).flatMap((part) =>
      nestedExtent(part, shift(offset, [shape.rect.x, shape.rect.y])),
    ),
  ],
  dot: (shape, offset) => square(shape.at, (shape.r ?? 6) * 2, offset),
  ring: (shape, offset) => square(shape.at, shape.r, offset),
  chip: (shape, offset) => {
    const { width, height } = chipSize(shape);
    return corners({ x: shape.at[0], y: shape.at[1], width, height }).map(
      (point) => shift(point, offset),
    );
  },
  text: (shape, offset) => {
    const size = shape.size ?? 16;
    return [
      shift(shape.at, [offset[0], offset[1] - size]),
      shift(shape.at, [
        offset[0] + [...shape.text].length * charWidth(size),
        offset[1],
      ]),
    ];
  },
  path: (shape, offset) => shape.points.map((point) => shift(point, offset)),
};

/** Plan points that bound a shape, at its offset. */
function extentOf(shape: Shape, offset: Point = [0, 0]): Point[] {
  const extent = EXTENTS[shape.kind] as (
    shape: Shape,
    offset: Point,
    nestedExtent: (shape: Shape, offset: Point) => Point[],
  ) => Point[];
  return extent(shape, offset, extentOf);
}

function entranceOf(shape: Shape): Entrance {
  if (shape.kind === "path")
    return shape.guide || shape.dashed ? "ghost" : "draw";
  if (shape.kind === "card" || shape.kind === "ring")
    return shape.dashed ? "ghost" : "emerge";
  if (shape.kind === "dot") return shape.hollow ? "ghost" : "emerge";
  return "emerge";
}

/** The plan vector from the nearest point of `rect` to `point`; zero inside it. */
const awayFrom = ({ x, y, width, height }: Rect, [px, py]: Point): Point => [
  px - Math.min(Math.max(px, x), x + width),
  py - Math.min(Math.max(py, y), y + height),
];
const reach = (rect: Rect, point: Point) =>
  Math.hypot(...awayFrom(rect, point));
const area = ({ width, height }: Rect) => width * height;
const holds = ({ x, y, width, height }: Rect, points: Point[]) =>
  points.every(
    ([px, py]) =>
      px >= x - 1 && px <= x + width + 1 && py >= y - 1 && py <= y + height + 1,
  );

function middle(points: Point[]): Point {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

/** A wire draws out from the hero, so it starts at its end nearer the hero. Data lines keep their direction. */
function outFrom(hero: Rect, shape: FloorShape): FloorShape {
  if (shape.kind !== "path" || shape.ink || entranceOf(shape) !== "draw")
    return shape;
  const [first, last] = [shape.points[0]!, shape.points.at(-1)!];
  return reach(hero, last) < reach(hero, first)
    ? { ...shape, points: [...shape.points].reverse() }
    : shape;
}

/** A part on its own: the farther from the hero, the later; it starts a few units back toward the hero. */
function cueOnFloor(hero: Rect, shape: FloorShape): Cue {
  const entrance = entranceOf(shape);
  const origin =
    shape.kind === "path" && entrance === "draw"
      ? shape.points[0]!
      : middle(extentOf(shape));
  const [dx, dy] = awayFrom(hero, origin);
  const distance = Math.hypot(dx, dy);
  return {
    entrance,
    ripple: Math.min(RIPPLE.max, distance * RIPPLE.perUnit),
    from: distance
      ? [(-dx / distance) * TRAVEL, (-dy / distance) * TRAVEL]
      : [0, TRAVEL],
  };
}

/**
 * The parts of one object, in drawing order: each STAGGER after the previous part entering the same way, and after
 * the object itself when there is one. Whatever sits in a dashed card is still to come, so it ghosts in with it.
 */
function cuesWithin(
  parts: FloorShape[],
  object: Cue | undefined,
  from: Point,
): Cue[] {
  const entrances = parts.map((part) =>
    object?.entrance === "ghost" ? "ghost" : entranceOf(part),
  );
  return entrances.map((entrance, i) => ({
    entrance,
    ripple:
      (object ? object.ripple + STAGGER : 0) +
      STAGGER *
        entrances.slice(0, i).filter((other) => other === entrance).length,
    from,
  }));
}

/** The smallest card drawn before the shape that holds it; the shape enters as part of that card. */
function cardHolding(shapes: Shape[], index: number): number | undefined {
  const shape = shapes[index]!;
  if (shape.kind === "card" || shape.kind === "block") return undefined;
  const points = extentOf(shape);
  return shapes.slice(0, index).reduce<number | undefined>((best, other, j) => {
    if (other.kind !== "card" || !holds(other.rect, points)) return best;
    const current = best === undefined ? undefined : shapes[best];
    return current?.kind === "card" && area(current.rect) <= area(other.rect)
      ? best
      : j;
  }, undefined);
}

/**
 * Plan shapes in drawing order, each with its entrance cue. Consecutive floor shapes share one plan group; a shape
 * inside a card enters with that card; the hero is its own group.
 */
function segmentsOf(shapes: Shape[]): Segment[] {
  const hero = shapes.find((shape) => shape.kind === "block")?.rect ?? {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
  const holders = shapes.map((_, i) => cardHolding(shapes, i));
  return shapes.reduce<Segment[]>((segments, shape, i) => {
    if (holders[i] !== undefined) return segments;
    if (shape.kind === "block") {
      // The face fills in as the hero settles, in reading order, each detail sliding in along the face
      const face = shape.on ?? [];
      const cues = cuesWithin(face as FloorShape[], undefined, [
        -TRAVEL * 0.66,
        0,
      ]);
      const heroGroup: HeroGroup = {
        kind: "hero",
        rect: shape.rect,
        depth: shape.depth ?? 14,
        isPlate: shape.plate === true,
        face: face.map((part, k) => ({
          shape: part as FloorShape,
          cue: cues[k]!,
        })),
      };
      return [...segments, heroGroup];
    }
    const placed = outFrom(hero, shape);
    const cue = cueOnFloor(hero, placed);
    const held = holders.flatMap((holder, j) =>
      holder === i ? [shapes[j] as FloorShape] : [],
    );
    const heldCues = cuesWithin(held, cue, [0, 0]);
    const piece: Piece = {
      shape: placed,
      cue,
      contents: held.map((part, k) => ({
        shape: outFrom(hero, part),
        cue: heldCues[k]!,
      })),
    };
    const last = segments.at(-1);
    if (last?.kind === "plan")
      return [
        ...segments.slice(0, -1),
        { kind: "plan", pieces: [...last.pieces, piece] },
      ];
    return [...segments, { kind: "plan", pieces: [piece] }];
  }, []);
}

/** The drawing's viewBox around all its shapes, the floor under them, and its shapes grouped for the entrance. */
function layoutDrawing(shapes: Shape[]): {
  viewBox: ViewBox;
  floor: Floor;
  offset: Point;
  segments: Segment[];
} {
  const points = shapes
    .flatMap((shape) => extentOf(shape))
    .map((point) => project(point));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const viewBox = {
    width: Math.ceil(maxX - minX + 2 * PAD.x),
    height: Math.ceil(maxY - minY + PAD.top + PAD.bottom + 14),
  };
  return {
    viewBox,
    floor: floorFor(viewBox, viewBox, GRID, { side: 0, top: 0 }),
    offset: [PAD.x - minX, PAD.top - minY],
    segments: segmentsOf(shapes),
  };
}

/** play while the entrance runs; pending (hidden) only where an observer is about to start it, so it never blinks. */
function entranceState(
  entrance: PlayTrigger,
  runs: number,
  startsHidden: boolean,
) {
  if (entrance === "off") return undefined;
  if (runs > 0) return "play";
  return startsHidden ? "pending" : undefined;
}

const TONE_CLASS: Record<Tone, string | undefined> = {
  pass: styles.pass,
  fail: styles.fail,
  neutral: styles.neutral,
  warm: styles.warm,
};

function pathClass(shape: Extract<Shape, { kind: "path" }>) {
  if (shape.guide) return scene.guide;
  if (shape.dashed) return `${styles.pending} ${styles.march}`;
  return shape.ink ? styles.data : scene.wire;
}

function CardShape({ shape }: { shape: Extract<Shape, { kind: "card" }> }) {
  return (
    <rect
      className={
        shape.dashed ? `${styles.placeholder} ${styles.march}` : scene.card
      }
      {...shape.rect}
    />
  );
}

function BarShape({ shape }: { shape: Extract<Shape, { kind: "bar" }> }) {
  const radius = Math.min(shape.rect.width, shape.rect.height) / 2;
  return (
    <rect
      className={
        shape.tone ? `${styles.bar} ${TONE_CLASS[shape.tone]}` : styles.bar
      }
      {...shape.rect}
      rx={radius}
    />
  );
}

function DotShape({ shape }: { shape: Extract<Shape, { kind: "dot" }> }) {
  const r = shape.r ?? 6;
  const [cx, cy] = shape.at;
  const tone = shape.tone ?? "neutral";
  if (shape.hollow)
    return (
      <circle
        className={`${styles.hollow} ${styles.march}`}
        data-tone={tone}
        cx={cx}
        cy={cy}
        r={r}
      />
    );
  return (
    <g data-tone={tone}>
      {shape.pulse && (
        <circle
          className={`${styles.ring} ${styles.pulse}`}
          cx={cx}
          cy={cy}
          r={r}
        />
      )}
      <circle
        className={`${scene.toned} ${scene.halo}`}
        cx={cx}
        cy={cy}
        r={r * 1.7}
      />
      <circle className={scene.toned} cx={cx} cy={cy} r={r} />
    </g>
  );
}

function ChipShape({ shape }: { shape: Extract<Shape, { kind: "chip" }> }) {
  return (
    <Chip
      x={shape.at[0]}
      y={shape.at[1]}
      slot={identifier(shape.text, 14)}
      tone={shape.soft ? "soft" : "solid"}
      fontSize={chipSize(shape).size}
      padX={6}
    />
  );
}

function TextShape({ shape }: { shape: Extract<Shape, { kind: "text" }> }) {
  return (
    <text
      className={styles[shape.tone ?? "label"]}
      x={shape.at[0]}
      y={shape.at[1]}
      style={{ fontSize: shape.size ?? 16 }}
    >
      {shape.text}
    </text>
  );
}

/** Solid lines draw in along their length (pathLength 1); guides and data still to come are dashed. */
function PathShape({ shape }: { shape: Extract<Shape, { kind: "path" }> }) {
  const d = shape.points
    .map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`)
    .join("");
  const isDashed = shape.guide === true || shape.dashed === true;
  return (
    <path
      className={pathClass(shape)}
      data-tone={shape.tone}
      d={d}
      pathLength={isDashed ? undefined : 1}
    />
  );
}

function RingShape({ shape }: { shape: Extract<Shape, { kind: "ring" }> }) {
  return (
    <circle
      className={
        shape.dashed ? `${styles.placeholder} ${styles.march}` : scene.card
      }
      cx={shape.at[0]}
      cy={shape.at[1]}
      r={shape.r}
    />
  );
}

const SHAPE_VIEWS: {
  [K in FloorShape["kind"]]: (props: {
    shape: Extract<Shape, { kind: K }>;
  }) => ReactNode;
} = {
  card: CardShape,
  bar: BarShape,
  dot: DotShape,
  chip: ChipShape,
  text: TextShape,
  path: PathShape,
  ring: RingShape,
};

function ShapeView({ shape }: { shape: FloorShape }) {
  const View = SHAPE_VIEWS[shape.kind] as (props: {
    shape: FloorShape;
  }) => ReactNode;
  return <View shape={shape} />;
}

/** A part in its entrance group, with what enters along with it. */
function Entering({ part, children }: { part: Part; children?: ReactNode }) {
  const { cue } = part;
  const timing = {
    "--ripple": Math.round(cue.ripple),
    "--from-x": `${round(cue.from[0])}px`,
    "--from-y": `${round(cue.from[1])}px`,
  } as CSSProperties;
  return (
    <g className={styles[cue.entrance]} style={timing}>
      <ShapeView shape={part.shape} />
      {children}
    </g>
  );
}

function PlanSegment({ segment }: { segment: PlanGroup }) {
  return (
    <g transform={planTransform(PROJECTION)}>
      {segment.pieces.map((piece, index) => (
        <Entering key={index} part={piece}>
          {piece.contents.map((part, k) => (
            <Entering key={k} part={part} />
          ))}
        </Entering>
      ))}
    </g>
  );
}

/** The hero breaks out of the plan group, since its sides are drawn in screen space; its face fills in as it settles. */
function HeroSegment({
  sceneId,
  segment,
}: {
  sceneId: string;
  segment: HeroGroup;
}) {
  const { rect, depth, isPlate, face } = segment;
  return (
    <g className={styles.land}>
      <Block
        sceneId={sceneId}
        projection={PROJECTION}
        runs={0}
        face={rect}
        depth={depth}
        isHero
        isAccented={!isPlate}
      >
        <g transform={`translate(${rect.x} ${rect.y})`}>
          {face.map((part, index) => (
            <Entering key={index} part={part} />
          ))}
        </g>
      </Block>
    </g>
  );
}

/** One empty-state drawing on its floor, filling its parent's height. Decorative: the text beside it carries the meaning. */
export function Drawing({ drawing, motion, backdrop, accent }: DrawingProps) {
  const id = useIllustrationId();
  const { entrance, idle, lift } = MOTION[motion];
  const playback = usePlayback(entrance, ENTRANCE_GAP);
  const layout = useMemo(() => layoutDrawing(DESIGNS[drawing]), [drawing]);

  return (
    <span
      className={styles.frame}
      data-idle={idle}
      data-entrance={entranceState(
        entrance,
        playback.runs,
        playback.startsHidden,
      )}
    >
      <Frame
        id={id}
        label={null}
        viewBox={layout.viewBox}
        floor={layout.floor}
        floorKind={backdrop}
        projection={PROJECTION}
        fit="height"
        accent={accent}
        lift={lift}
        playback={{ runs: 0, startsHidden: false, observe: playback.observe }}
        floorMask={null}
        underlay={null}
      >
        <g
          key={playback.runs}
          transform={`translate(${layout.offset[0]} ${layout.offset[1]})`}
        >
          {layout.segments.map((segment, index) =>
            segment.kind === "hero" ? (
              <HeroSegment key={index} sceneId={id} segment={segment} />
            ) : (
              <PlanSegment key={index} segment={segment} />
            ),
          )}
        </g>
      </Frame>
    </span>
  );
}

/** Every shape but the hero, which the drawing renders as a Block. */
type FloorShape = Exclude<Shape, { kind: "block" }>;
type Entrance = "emerge" | "draw" | "ghost";
type Cue = { entrance: Entrance; ripple: number; from: Point };
type Part = { shape: FloorShape; cue: Cue };
type Piece = Part & { contents: Part[] };
type PlanGroup = { kind: "plan"; pieces: Piece[] };
type HeroGroup = {
  kind: "hero";
  rect: Rect;
  depth: number;
  isPlate: boolean;
  face: Part[];
};
type Segment = PlanGroup | HeroGroup;

export const __test = { layoutDrawing, segmentsOf };
