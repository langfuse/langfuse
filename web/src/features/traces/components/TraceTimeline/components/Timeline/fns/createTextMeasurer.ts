import type { TextMeasurer } from "../types";
import { createTextMeasurerFrom } from "./createTextMeasurerFrom";

export function createTextMeasurer(font = "12px ui-sans-serif"): TextMeasurer {
  let context: CanvasRenderingContext2D | null = null;
  try {
    context =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
  } catch {
    context = null;
  }
  return createTextMeasurerFrom(context, font);
}
