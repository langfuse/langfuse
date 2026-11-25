/**
 * The empty-state drawings' layout: each shape's plan extent, the drawing's viewBox and floor, and the entrance cues
 * that order its parts.
 */

import {
  chipHeight,
  chipWidth,
  corners,
  type Floor,
  floorFor,
  type Point,
  project,
  type Rect,
  textWidth,
  type ViewBox,
} from "../engine/projection";
import type { FloorShape, Shape } from "./designs";

const GRID = { cell: 36, u: 0, v: 0 };
const PAD = { x: 22, top: 30, bottom: 26 };
/** The hero's depth when its design sets none; the viewBox leaves room for the sides under its face. */
const HERO_DEPTH = 14;
/** Font size of text and chips that set none. */
export const TEXT_SIZE = 16;
/** A chip's text inset on each side. */
export const CHIP_PAD_X = 6;
/** Radius of dots that set none. */
export const DOT_RADIUS = 6;

/*
 * The entrance runs in four beats, timed in Drawing.module.css. Each part gets its place in one: --ripple (ms) grows
 * with its distance from the hero, --from-x/y points back at the hero, and a card's contents enter with it.
 */
/** ms of ripple per plan unit between a part and the hero, and its cap */
const RIPPLE = { perUnit: 1.2, max: 240 };
/** ms between parts of one object (a card's contents, the hero's face) that enter the same way */
const STAGGER = 40;
/** plan units a part travels out from the hero as it emerges */
const TRAVEL = 6;
/**
 * The least ms between entrances: the last ghosts start 440 ms plus the ripple cap in and run 480 ms
 * (Drawing.module.css), so a hover that leaves and comes back can't restart an entrance still playing.
 */
export const ENTRANCE_GAP = 440 + RIPPLE.max + 480 + STAGGER;

type Entrance = "emerge" | "draw" | "ghost";
type Cue = { entrance: Entrance; ripple: number; from: Point };
export type Part = { shape: FloorShape; cue: Cue };
type Piece = Part & { contents: Part[] };
export type PlanGroup = { kind: "plan"; pieces: Piece[] };
export type HeroGroup = {
  kind: "hero";
  rect: Rect;
  depth: number;
  isPlate: boolean;
  face: Part[];
};
type Segment = PlanGroup | HeroGroup;

const shift = ([x, y]: Point, [dx, dy]: Point): Point => [x + dx, y + dy];

const square = (at: Point, r: number, [dx, dy]: Point): Point[] => [
  shift(at, [dx - r, dy - r]),
  shift(at, [dx + r, dy + r]),
];

const rectExtent = (rect: Rect, offset: Point) =>
  corners(rect).map((point) => shift(point, offset));

function chipRect(shape: Extract<Shape, { kind: "chip" }>): Rect {
  const size = shape.size ?? TEXT_SIZE;
  return {
    x: shape.at[0],
    y: shape.at[1],
    width: chipWidth(shape.text, size, CHIP_PAD_X),
    height: chipHeight(size),
  };
}

const EXTENTS: {
  [K in Shape["kind"]]: (
    shape: Extract<Shape, { kind: K }>,
    offset: Point,
  ) => Point[];
} = {
  card: (shape, offset) => rectExtent(shape.rect, offset),
  bar: (shape, offset) => rectExtent(shape.rect, offset),
  block: (shape, offset) => [
    ...rectExtent(shape.rect, offset),
    ...(shape.on ?? []).flatMap((part) =>
      extentOf(part, shift(offset, [shape.rect.x, shape.rect.y])),
    ),
  ],
  dot: (shape, offset) => square(shape.at, (shape.r ?? DOT_RADIUS) * 2, offset),
  ring: (shape, offset) => square(shape.at, shape.r, offset),
  chip: (shape, offset) => rectExtent(chipRect(shape), offset),
  text: (shape, offset) => {
    const size = shape.size ?? TEXT_SIZE;
    return [
      shift(shape.at, [offset[0], offset[1] - size]),
      shift(shape.at, [offset[0] + textWidth(shape.text, size), offset[1]]),
    ];
  },
  path: (shape, offset) => shape.points.map((point) => shift(point, offset)),
};

/** Plan points that bound a shape, at its offset. */
export function extentOf(shape: Shape, offset: Point = [0, 0]): Point[] {
  const extent = EXTENTS[shape.kind] as (
    shape: Shape,
    offset: Point,
  ) => Point[];
  return extent(shape, offset);
}

function entranceOf(shape: FloorShape): Entrance {
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
function partsWithin(
  shapes: FloorShape[],
  object: Cue | undefined,
  from: Point,
): Part[] {
  const entrances = shapes.map((shape) =>
    object?.entrance === "ghost" ? "ghost" : entranceOf(shape),
  );
  return shapes.map((shape, i) => ({
    shape,
    cue: {
      entrance: entrances[i]!,
      ripple:
        (object ? object.ripple + STAGGER : 0) +
        STAGGER *
          entrances.slice(0, i).filter((other) => other === entrances[i])
            .length,
      from,
    },
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
export function segmentsOf(shapes: Shape[]): Segment[] {
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
      const heroGroup: HeroGroup = {
        kind: "hero",
        rect: shape.rect,
        depth: shape.depth ?? HERO_DEPTH,
        isPlate: shape.plate === true,
        face: partsWithin(shape.on ?? [], undefined, [-TRAVEL * 0.66, 0]),
      };
      return [...segments, heroGroup];
    }
    const placed = outFrom(hero, shape);
    const cue = cueOnFloor(hero, placed);
    const held = shapes.filter(
      (other, j): other is FloorShape =>
        holders[j] === i && other.kind !== "block",
    );
    const piece: Piece = {
      shape: placed,
      cue,
      contents: partsWithin(
        held.map((part) => outFrom(hero, part)),
        cue,
        [0, 0],
      ),
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
export function layoutDrawing(shapes: Shape[]): {
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
    height: Math.ceil(maxY - minY + PAD.top + PAD.bottom + HERO_DEPTH),
  };
  return {
    viewBox,
    floor: floorFor(viewBox, viewBox, GRID, { side: 0, top: 0 }),
    offset: [PAD.x - minX, PAD.top - minY],
    segments: segmentsOf(shapes),
  };
}
