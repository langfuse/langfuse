/**
 * Plan → screen geometry shared by every illustration. Things on the floor are laid out flat in plan units and drawn
 * through one projection traced from the landing images: grid cells of 36, axes at −20° and 60°.
 */

export type Projection = readonly [number, number, number, number];
export type Point = readonly [number, number];
export type Rect = { x: number; y: number; width: number; height: number };
export type ViewBox = { width: number; height: number };

export const PROJECTION: Projection = [0.9384, -0.3415, 0.4993, 0.8648];

/** Monospace at a 0.6em advance (Geist Mono, IBM Plex Mono): every string's width is known from its length. */
const charWidth = (fontSize: number) => fontSize * 0.6;

export const textWidth = (text: string, fontSize: number) =>
  [...text].length * charWidth(fontSize);

/** A tag's size: its text and `padX` on each side, 1.45 of the font tall. */
export const chipWidth = (text: string, fontSize: number, padX: number) =>
  textWidth(text, fontSize) + 2 * padX;

export const chipHeight = (fontSize: number) => Math.round(fontSize * 1.45);

export const round = (n: number) => Math.round(n * 100) / 100;

export const planTransform = ([a, b, c, d]: Projection = PROJECTION) =>
  `matrix(${a} ${b} ${c} ${d} 0 0)`;

export const project = (
  [u, v]: Point,
  [a, b, c, d]: Projection = PROJECTION,
): Point => [a * u + c * v, b * u + d * v];

const unproject = (
  [x, y]: Point,
  [a, b, c, d]: Projection = PROJECTION,
): Point => {
  const det = a * d - c * b;
  return [(d * x - c * y) / det, (a * y - b * x) / det];
};

export const corners = ({ x, y, width, height }: Rect): Point[] => [
  [x, y],
  [x + width, y],
  [x + width, y + height],
  [x, y + height],
];

export type GridSpec = { cell: number; u: number; v: number };

/** Plan grid lines covering the whole viewBox, one cell past each edge, as one path. */
function gridPath(
  { width, height }: ViewBox,
  grid: GridSpec,
  projection: Projection = PROJECTION,
): string {
  const plan = (
    [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ] as Point[]
  ).map((point) => unproject(point, projection));
  const us = plan.map(([u]) => u);
  const vs = plan.map(([, v]) => v);
  const uMin = Math.round(Math.min(...us) - grid.cell);
  const uMax = Math.round(Math.max(...us) + grid.cell);
  const vMin = Math.round(Math.min(...vs) - grid.cell);
  const vMax = Math.round(Math.max(...vs) + grid.cell);
  const lines = (origin: number, min: number, max: number) => {
    const first = origin + Math.ceil((min - origin) / grid.cell) * grid.cell;
    return Array.from(
      { length: Math.floor((max - first) / grid.cell) + 1 },
      (_, i) => round(first + i * grid.cell),
    );
  };
  return [
    ...lines(grid.u, uMin, uMax).map((u) => `M${u} ${vMin}V${vMax}`),
    ...lines(grid.v, vMin, vMax).map((v) => `M${uMin} ${v}H${uMax}`),
  ].join("");
}

export type Floor = {
  panel: Rect;
  fade: { cx: number; cy: number; r: number };
  gridPath: string;
};

/** The tinted panel inset from the top and sides, and the radial fade that carries the grid past it. */
export function floorFor(
  viewBox: ViewBox,
  base: ViewBox,
  grid: GridSpec,
  panelInset = { side: 32, top: 52 },
  projection: Projection = PROJECTION,
): Floor {
  return {
    panel: {
      x: panelInset.side,
      y: panelInset.top,
      width: viewBox.width - 2 * panelInset.side,
      height: viewBox.height - panelInset.top,
    },
    fade: {
      cx: viewBox.width / 2,
      cy: (panelInset.top + viewBox.height) / 2,
      r: round(
        0.573 *
          base.width *
          Math.max(viewBox.width / base.width, viewBox.height / base.height),
      ),
    },
    gridPath: gridPath(viewBox, grid, projection),
  };
}
