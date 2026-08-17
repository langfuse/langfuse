/**
 * Duration-label text measurement — ported from Sentry's
 * `traceRenderers/traceTextMeasurer.tsx`.
 *
 * Measures each digit and unit string ONCE against a canvas, then sums cached
 * glyph widths per label. That is what lets `layout()` decide inside the pure
 * function whether a duration label fits in its bar or has to sit outside it —
 * a decision CSS flow currently makes, and makes wrong in a narrow lane.
 *
 * Production code, arriving one PR before its callers: the renderer beside it
 * (`TimelineV2.tsx`) is a Storybook harness and says so, this is not.
 */

/** Manual measurement average; used when no 2D context is available. */
export const PX_PER_LETTER = 6.5;

const UNITS = ["ns", "ms", "s", "m", "min", "h", "d", "∑"] as const;

/**
 * Longest first, so "min" is never read as "m" followed by letters — and so a
 * COMPOUND label measures every unit in it. Matching a unit only when it is the
 * whole remainder of the string meant `1m 35s` and `1h 05m`, which is what
 * `formatDurationMs` emits above a minute, measured their leading unit at the
 * flat per-letter estimate and fed a slightly wrong width to the decision about
 * which side of a bar the label goes on.
 */
const UNITS_LONGEST_FIRST = [...UNITS].sort((a, b) => b.length - a.length);

const unitAt = (text: string, index: number): string | null => {
  for (const unit of UNITS_LONGEST_FIRST) {
    if (text.startsWith(unit, index)) return unit;
  }
  return null;
};

export type TextMeasurer = { measure: (text: string) => number };

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

/** Explicit-context entry point: `null` exercises the `PX_PER_LETTER` fallback. */
export function createTextMeasurerFrom(
  context: CanvasRenderingContext2D | null,
  font = "12px ui-sans-serif",
): TextMeasurer {
  const glyphs = new Map<string, number>();
  const units = new Map<string, number>();
  const cache = new Map<string, number>();

  if (context) {
    context.font = font;
    // One width for every digit keeps tabular labels stable as they tick.
    let digit = 0;
    for (let i = 0; i < 10; i++) {
      digit = Math.max(digit, context.measureText(String(i)).width);
    }
    for (let i = 0; i < 10; i++) glyphs.set(String(i), digit);
    for (const char of [".", ",", " "]) {
      glyphs.set(char, context.measureText(char).width);
    }
    for (const unit of UNITS) units.set(unit, context.measureText(unit).width);
  } else {
    for (const unit of UNITS) units.set(unit, unit.length * PX_PER_LETTER);
  }

  const computeWidth = (text: string) => {
    let width = 0;
    for (let i = 0; i < text.length; i++) {
      const glyph = glyphs.get(text[i]!);
      if (glyph !== undefined) {
        width += glyph;
        continue;
      }
      const unit = unitAt(text, i);
      if (unit !== null) {
        width += units.get(unit) ?? unit.length * PX_PER_LETTER;
        i += unit.length - 1;
        continue;
      }
      width += PX_PER_LETTER;
    }
    return width;
  };

  return {
    measure: (text) => {
      const cached = cache.get(text);
      if (cached !== undefined) return cached;
      const width = computeWidth(text);
      cache.set(text, width);
      return width;
    },
  };
}
