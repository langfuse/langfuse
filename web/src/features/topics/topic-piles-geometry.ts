import {
  planTransform,
  project,
  round,
  type Point,
} from "@/src/components/illustrations/engine/projection";

/** Floor units of the Topics drawings: a 36 grid, piles 5 x 3 squares and 6 squares apart, sheets 8 high. */
export const GRID = 36;
export const PILE = { width: 180, depth: 108, pitch: 216 };
export const SHEET = { height: 8, traces: 24 };
export const PLANE = planTransform();

/** Category colours the clusters take, in order. */
export const PILE_COLORS = ["violet", "blue", "amber"] as const;
export type PileColor = (typeof PILE_COLORS)[number];

export type FloorRect = { x: number; y: number; width: number; depth: number };

/** Screen position of a floor point raised by `z`, as "x y". */
export function raised(x: number, y: number, z = 0) {
  return at(screen(x, y, z));
}

/** The silhouette of a slab standing on `rect` and `height` tall: six corners, each rounded by `radius`. */
export function slabOutline(rect: FloorRect, height: number, radius: number) {
  const x1 = rect.x + rect.width;
  const y1 = rect.y + rect.depth;
  const corners = [
    screen(rect.x, rect.y, height),
    screen(x1, rect.y, height),
    screen(x1, y1, height),
    screen(x1, y1),
    screen(rect.x, y1),
    screen(rect.x, rect.y),
  ];
  return (
    corners
      .map((point, index) => {
        const from = corners[(index + corners.length - 1) % corners.length];
        const to = corners[(index + 1) % corners.length];
        const turn = `${at(toward(point, from ?? point, radius))}Q${at(point)} ${at(toward(point, to ?? point, radius))}`;
        return `${index ? "L" : "M"}${turn}`;
      })
      .join("") + "Z"
  );
}

/** A category colour mixed `percent` strong into a surface token; `amount` (0 to 1) is how far it has come from neutral grey. */
export function tint(
  color: PileColor,
  percent: number,
  surface: "background" | "card",
  amount = 1,
) {
  const highlight = between(
    "var(--category-neutral-highlight)",
    `var(--category-${color}-highlight)`,
    amount,
  );
  return `color-mix(in oklch, ${highlight} ${round(percent)}%, hsl(var(--${surface})))`;
}

/** A category's text colour, `amount` (0 to 1) of the way from the tertiary grey. */
export function ink(color: PileColor, amount: number) {
  return between(
    "hsl(var(--foreground-tertiary))",
    `var(--category-${color}-foreground)`,
    amount,
  );
}

/** How strong each sheet's colour is, bottom sheet first: strongest at the bottom, fading upward. */
export function sheetStrengths(sheets: number) {
  return Array.from({ length: sheets }, (_, index) =>
    sheets > 1 ? 100 - (index / (sheets - 1)) * 58 : 100,
  );
}

/** A colour `amount` (0 to 1) of the way from one token to another. */
function between(from: string, to: string, amount: number) {
  if (amount <= 0.005) return from;
  if (amount >= 0.995) return to;
  return `color-mix(in oklab, ${to} ${round(amount * 100)}%, ${from})`;
}

function screen(x: number, y: number, z = 0): Point {
  const [screenX, screenY] = project([x, y]);
  return [screenX, screenY - z];
}

function at([x, y]: Point) {
  return `${round(x)} ${round(y)}`;
}

function toward(
  [x, y]: Point,
  [targetX, targetY]: Point,
  radius: number,
): Point {
  const ratio = radius / (Math.hypot(targetX - x, targetY - y) || 1);
  return [x + (targetX - x) * ratio, y + (targetY - y) * ratio];
}
