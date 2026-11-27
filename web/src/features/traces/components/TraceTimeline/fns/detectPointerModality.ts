import type { PointerModality } from "../types";

export function detectPointerModality(): PointerModality {
  if (typeof window === "undefined" || !window.matchMedia) return "fine";
  return window.matchMedia("(pointer: coarse)").matches ? "coarse" : "fine";
}
