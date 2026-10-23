// @vitest-environment node

import { describe, expect, it } from "vitest";
import { project, type Point, type Rect } from "../engine/projection";
import { DESIGNS, type DrawingName, type Shape } from "./designs";
import { __test } from "./Drawing";

const { segmentsOf } = __test;
const names = Object.keys(DESIGNS) as DrawingName[];

const heroOf = (name: DrawingName) =>
  segmentsOf(DESIGNS[name]).flatMap((segment) =>
    segment.kind === "hero" ? [segment] : [],
  );
const floorParts = (name: DrawingName) =>
  segmentsOf(DESIGNS[name]).flatMap((segment) =>
    segment.kind === "plan"
      ? segment.pieces.flatMap((piece) => [piece, ...piece.contents])
      : [],
  );

describe("the entrance", () => {
  it("gives every drawing exactly one raised hero", () => {
    for (const name of names) expect(heroOf(name), name).toHaveLength(1);
  });

  it("fills the hero's face in reading order", () => {
    const [hero] = heroOf("datasets");
    expect(
      hero!.face
        .filter((part) => part.cue.entrance === "emerge")
        .map((part) => part.cue.ripple),
    ).toEqual([0, 40, 80]);
  });

  it("ghosts in every dashed outline, the farther from the hero the later", () => {
    for (const name of names) {
      for (const { shape, cue } of floorParts(name)) {
        const isDashed = "dashed" in shape && shape.dashed === true;
        if (isDashed) expect(cue.entrance, name).toBe("ghost");
      }
    }
    const ghosts = floorParts("datasets")
      .filter((part) => part.cue.entrance === "ghost")
      .map((part) => part.cue.ripple);
    expect(ghosts).toEqual([...ghosts].sort((a, b) => a - b));
  });

  it("brings what sits in a dashed card in with it, after it", () => {
    const [card] = segmentsOf(DESIGNS.apiKeys).flatMap((segment) =>
      segment.kind === "plan" ? segment.pieces : [],
    );
    const [held] = card!.contents;

    expect(held!.cue.entrance).toBe("ghost");
    expect(held!.cue.ripple).toBeGreaterThan(card!.cue.ripple);
  });

  it("draws wires out from the hero", () => {
    // prompts' v1 → v2 wire is authored from v1; it draws from v2, the hero
    const wire = floorParts("prompts").find(
      ({ shape }) => shape.kind === "path",
    );
    expect(wire!.shape.kind === "path" && wire!.shape.points[0]).toEqual([
      38, 62,
    ]);
  });
});

const cornersOf = ({ x, y, width, height }: Rect): Point[] => [
  [x, y],
  [x + width, y],
  [x + width, y + height],
  [x, y + height],
];

/** A floor shape's plan outline; wires are left out, since they draw out from the hero by design. */
function outlineOf(shape: Shape): Point[] | null {
  if (shape.kind === "card" || shape.kind === "bar")
    return cornersOf(shape.rect);
  if (shape.kind === "chip") {
    const size = shape.size ?? 16;
    return cornersOf({
      x: shape.at[0],
      y: shape.at[1],
      width: shape.text.length * 0.6 * size + 12,
      height: size * 1.45,
    });
  }
  if (shape.kind === "text") {
    const size = shape.size ?? 16;
    return cornersOf({
      x: shape.at[0],
      y: shape.at[1] - size,
      width: shape.text.length * 0.6 * size,
      height: size,
    });
  }
  if (shape.kind === "dot" || shape.kind === "ring") {
    const r = shape.r ?? 4;
    return cornersOf({
      x: shape.at[0] - r,
      y: shape.at[1] - r,
      width: 2 * r,
      height: 2 * r,
    });
  }
  return null;
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort(([ax, ay], [bx, by]) => ax - bx || ay - by);
  const turn = (o: Point, p: Point, q: Point) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const half = (list: Point[]) =>
    list.reduce<Point[]>((hull, point) => {
      const next = [...hull];
      while (next.length >= 2 && turn(next.at(-2)!, next.at(-1)!, point) <= 0)
        next.pop();
      return [...next, point];
    }, []);
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Signed distance between two point sets' convex hulls by separating axes: positive is a gap, negative an overlap. */
function separation(a: Point[], b: Point[]) {
  const axes = [a, b].flatMap((points) => {
    const hull = convexHull(points);
    return hull.map(([x1, y1], i) => {
      const [x2, y2] = hull[(i + 1) % hull.length]!;
      const length = Math.hypot(y2 - y1, x2 - x1) || 1;
      return [(y2 - y1) / length, (x1 - x2) / length] as const;
    });
  });
  return Math.max(
    ...axes.map(([nx, ny]) => {
      const onA = a.map(([x, y]) => x * nx + y * ny);
      const onB = b.map(([x, y]) => x * nx + y * ny);
      return Math.max(
        Math.min(...onB) - Math.max(...onA),
        Math.min(...onA) - Math.max(...onB),
      );
    }),
  );
}

/** Screen px of air every floor shape keeps from the hero's footprint (its face and the sides hanging under it). */
const CLEARANCE_PX = 6;

describe("the floor around the hero", () => {
  it("keeps every floor shape clear of the hero, unless it's layered on purpose", () => {
    const tucked = names.flatMap((name) => {
      const shapes = DESIGNS[name] as readonly Shape[];
      const hero = shapes.find((shape) => shape.kind === "block");
      if (!hero || hero.kind !== "block") return [];
      const face = cornersOf(hero.rect).map((point) => project(point));
      const depth = hero.depth ?? 14;
      const footprint = [
        ...face,
        ...face.map(([x, y]): Point => [x, y + depth]),
      ];
      return shapes.flatMap((shape, index) => {
        const outline = outlineOf(shape);
        if (!outline || (shape.kind === "card" && shape.isLayered)) return [];
        const gap = separation(
          footprint,
          outline.map((point) => project(point)),
        );
        return gap < CLEARANCE_PX
          ? [`${name} #${index} ${shape.kind}: ${gap.toFixed(1)}px`]
          : [];
      });
    });
    expect(tucked).toEqual([]);
  });
});
