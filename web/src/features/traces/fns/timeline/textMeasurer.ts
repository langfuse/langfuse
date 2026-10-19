/**
 * Duration-label text measurement — ported from Sentry's
 * `traceRenderers/traceTextMeasurer.tsx`.
 *
 * Measures each digit and unit string ONCE against a canvas, then sums cached
 * glyph widths per label. That is what lets `layout()` decide inside the pure
 * function whether a duration label fits in its bar or has to sit outside it —
 * a decision CSS flow makes wrong in a narrow lane.
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

export type TextMeasurer = {
  measure: (text: string) => number;
};

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
  return { measure: measurerFor(context, font) };
}

/**
 * The px size out of a CSS font shorthand — the SIZE, not the first number in
 * the string. A shorthand can lead with a weight (`700 11px …`), and reading the
 * leading number there takes the weight: paired with the correction below, that
 * scales every width by seventy rather than by one.
 */
function pxSizeOf(font: string): number {
  const match = /(\d*\.?\d+)px/.exec(font);
  return match ? Number.parseFloat(match[1]!) : NaN;
}

function measurerFor(
  context: CanvasRenderingContext2D | null,
  font: string,
): (text: string) => number {
  const glyphs = new Map<string, number>();
  const units = new Map<string, number>();
  const cache = new Map<string, number>();

  // A canvas can REFUSE a font string and say nothing: `context.font` keeps its
  // previous value — `10px sans-serif` on a fresh context — and every width
  // afterwards is short by the size ratio. That is invisible, and it is the
  // direction that clips: a caller pricing a 12px label against 10px metrics
  // admits content that does not fit. So the size is read back and any
  // difference is corrected rather than trusted.
  const scale = (() => {
    if (!context) return 1;
    context.font = font;
    const asked = pxSizeOf(font);
    const got = pxSizeOf(context.font);
    return Number.isFinite(asked) && Number.isFinite(got) && got > 0
      ? asked / got
      : 1;
  })();

  if (context) {
    context.font = font;
    // One width for every digit keeps tabular labels stable as they tick.
    let digit = 0;
    for (let i = 0; i < 10; i++) {
      digit = Math.max(digit, context.measureText(String(i)).width * scale);
    }
    for (let i = 0; i < 10; i++) glyphs.set(String(i), digit);
    for (const char of [".", ",", " "]) {
      glyphs.set(char, context.measureText(char).width * scale);
    }
    for (const unit of UNITS) {
      units.set(unit, context.measureText(unit).width * scale);
    }
  } else {
    for (const unit of UNITS) units.set(unit, unit.length * PX_PER_LETTER);
  }

  const computeWidth = (text: string) => {
    let width = 0;
    // Anything that is neither a digit nor a duration unit is measured as a run,
    // not estimated per letter: callers now price arbitrary text with this
    // (a score's name, a level label), and at 6.5px a letter `quality:` came out
    // 13px wider than it renders — slack that hides a real under-reservation
    // somewhere else in the same sum.
    let run = "";
    const flush = () => {
      if (!run) return;
      if (context) {
        // Set every time: the context is not ours alone, and whatever drew on
        // it last would otherwise decide the font for these widths.
        context.font = font;
        width += context.measureText(run).width * scale;
      } else {
        width += run.length * PX_PER_LETTER;
      }
      run = "";
    };
    for (let i = 0; i < text.length; i++) {
      const glyph = glyphs.get(text[i]!);
      if (glyph !== undefined) {
        flush();
        width += glyph;
        continue;
      }
      const unit = unitAt(text, i);
      if (unit !== null) {
        flush();
        width += units.get(unit) ?? unit.length * PX_PER_LETTER;
        i += unit.length - 1;
        continue;
      }
      run += text[i]!;
    }
    flush();
    return width;
  };

  return (text: string) => {
    const cached = cache.get(text);
    if (cached !== undefined) return cached;
    const width = computeWidth(text);
    cache.set(text, width);
    return width;
  };
}
