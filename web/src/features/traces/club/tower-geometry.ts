import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Point = readonly [number, number, number];

/** A solid lattice model, six units tall with its antenna and feet at ±3. */
export function createTowerGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  const up = new Vector3(0, 1, 0);
  const direction = new Vector3();
  const rotation = new Quaternion();

  function box(width: number, height: number, depth: number, at: Point) {
    pieces.push(
      new BoxGeometry(width, height, depth).translate(at[0], at[1], at[2]),
    );
  }

  function beam(from: Point, to: Point, width: number, depth = width) {
    direction.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const length = direction.length();
    rotation.setFromUnitVectors(up, direction.normalize());
    pieces.push(
      new BoxGeometry(width, length, depth)
        .applyQuaternion(rotation)
        .translate(
          (from[0] + to[0]) / 2,
          (from[1] + to[1]) / 2,
          (from[2] + to[2]) / 2,
        ),
    );
  }

  function turn(point: Point, side: number): Point {
    const [x, y, z] = point;
    switch (side) {
      case 1:
        return [-z, y, x];
      case 2:
        return [-x, y, -z];
      case 3:
        return [z, y, -x];
      default:
        return point;
    }
  }

  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const;

  // Each leg has four solid chords and crossed webs around its open interior.
  function latticeLeg(
    sx: number,
    sz: number,
    stations: ReadonlyArray<readonly [number, number, number]>,
    chord: number,
    web: number,
  ) {
    const points = stations.map(([y, radius, thickness]) =>
      corners.map(
        ([cx, cz]): Point => [
          sx * radius + (cx * thickness) / 2,
          y,
          sz * radius + (cz * thickness) / 2,
        ],
      ),
    );
    for (let row = 0; row < points.length; row++) {
      const ring = points[row]!;
      for (let corner = 0; corner < 4; corner++) {
        const next = (corner + 1) % 4;
        beam(ring[corner]!, ring[next]!, web);
        if (row === points.length - 1) continue;
        const above = points[row + 1]!;
        beam(ring[corner]!, above[corner]!, chord);
        beam(ring[corner]!, above[next]!, web);
        beam(ring[next]!, above[corner]!, web);
      }
    }
  }

  const lowerStations = [
    [0.065, 1.22, 0.22],
    [0.33, 1.1, 0.2],
    [0.63, 0.96, 0.17],
    [0.92, 0.82, 0.145],
    [1.18, 0.7, 0.12],
  ] as const;
  const middleStations = [
    [1.24, 0.67, 0.12],
    [1.48, 0.58, 0.105],
    [1.73, 0.505, 0.09],
    [1.98, 0.44, 0.08],
    [2.25, 0.39, 0.07],
  ] as const;

  for (const [sx, sz] of corners) {
    box(0.36, 0.065, 0.36, [sx * 1.22, 0.0325, sz * 1.22]);
    latticeLeg(sx, sz, lowerStations, 0.039, 0.018);
    latticeLeg(sx, sz, middleStations, 0.029, 0.014);
  }

  // The four curved arch ribs leave a walk-through opening under the first deck.
  for (let side = 0; side < 4; side++) {
    for (let segment = 0; segment < 18; segment++) {
      const arch = (index: number, inset: number): Point => {
        const x = (index / 18) * 2 - 1;
        const y = 0.25 + 0.74 * (1 - x * x) + inset;
        return turn([x * 1.1, y, 1.29 - 0.45 * y], side);
      };
      beam(arch(segment, 0), arch(segment + 1, 0), 0.046, 0.063);
      beam(arch(segment, 0.1), arch(segment + 1, 0.1), 0.027, 0.052);
      beam(arch(segment, 0), arch(segment + 1, 0.1), 0.018);
      beam(arch(segment, 0.1), arch(segment + 1, 0), 0.018);
    }
  }

  function balcony(y: number, width: number, height: number, posts: number) {
    const half = width / 2;
    box(width, 0.068, width, [0, y, 0]);
    box(width + 0.07, 0.025, width + 0.07, [0, y - 0.045, 0]);
    for (let side = 0; side < 4; side++) {
      const left = (level: number): Point => turn([-half, level, half], side);
      const right = (level: number): Point => turn([half, level, half], side);
      beam(left(y + height), right(y + height), 0.025);
      beam(left(y + height / 2), right(y + height / 2), 0.015);
      for (let post = 0; post <= posts; post++) {
        const x = -half + (width * post) / posts;
        beam(
          turn([x, y + 0.035, half], side),
          turn([x, y + height, half], side),
          0.015,
        );
      }
    }
  }
  balcony(1.18, 1.7, 0.15, 15);
  balcony(2.25, 1.05, 0.13, 10);

  // Above the second deck the four legs merge into one tapering square pylon.
  const pylonStations = [
    [2.32, 0.37],
    [2.63, 0.31],
    [2.95, 0.26],
    [3.28, 0.215],
    [3.61, 0.178],
    [3.94, 0.146],
    [4.27, 0.119],
    [4.6, 0.096],
    [4.94, 0.076],
    [5.22, 0.06],
  ] as const;
  for (let row = 0; row < pylonStations.length - 1; row++) {
    const [y, radius] = pylonStations[row]!;
    const [top, topRadius] = pylonStations[row + 1]!;
    for (let side = 0; side < 4; side++) {
      const a = turn([-radius, y, radius], side);
      const b = turn([radius, y, radius], side);
      const c = turn([-topRadius, top, topRadius], side);
      const d = turn([topRadius, top, topRadius], side);
      beam(a, c, 0.023);
      beam(a, b, 0.018);
      beam(a, d, 0.014);
      beam(b, c, 0.014);
      beam(
        turn([-radius * 0.96, y + 0.04, radius * 0.96], side),
        turn([radius * 0.96, y + 0.04, radius * 0.96], side),
        0.01,
      );
    }
  }

  balcony(5.2, 0.32, 0.12, 3);
  box(0.16, 0.2, 0.16, [0, 5.34, 0]);
  pieces.push(
    new CylinderGeometry(0.025, 0.075, 0.19, 8).translate(0, 5.535, 0),
    new CylinderGeometry(0.007, 0.018, 0.37, 8).translate(0, 5.815, 0),
  );
  for (let ring = 0; ring < 3; ring++) {
    pieces.push(
      new CylinderGeometry(0.035, 0.035, 0.016, 8).translate(
        0,
        5.68 + ring * 0.1,
        0,
      ),
    );
  }

  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  if (!geometry) throw new Error("The tower model could not be assembled.");
  geometry.translate(0, -3, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
