import { planTransform } from "@/src/components/illustrations/engine/projection";

/** Floor units of the Topics pile drawings: a 36 grid, piles 5 x 3 squares and 6 squares apart, sheets 8 high. */
export const GRID = 36;
export const PILE = { width: 180, depth: 108, pitch: 216 };
export const SHEET = { height: 8, traces: 24 };
export const PLANE = planTransform();
