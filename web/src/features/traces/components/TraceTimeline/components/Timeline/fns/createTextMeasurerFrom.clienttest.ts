import { describe, expect, it } from "vitest";
import { PX_PER_LETTER } from "../constants";
import { createTextMeasurerFrom } from "./createTextMeasurerFrom";

describe("textMeasurer", () => {
  // Every glyph 10px wide, so a measured width is countable by hand and the
  // per-letter fallback (6.5) is visible whenever one is used by mistake.
  const tenPerGlyph = {
    font: "",
    measureText: (text: string) => ({ width: text.length * 10 }),
  } as unknown as CanvasRenderingContext2D;

  it("measures every unit in a compound label, not just the last", () => {
    const measure = createTextMeasurerFrom(tenPerGlyph).measure;

    // `1m 35s` is six glyphs, so 60 — and it is only 60 if the leading `m` was
    // measured too. Matching a unit only as the whole remainder of the string
    // left it on the flat estimate, which is what every label above a minute is.
    expect(measure("1m 35s")).toBeCloseTo(60, 6);
    expect(measure("1h 30m")).toBeCloseTo(60, 6);
    expect(measure("486ms")).toBeCloseTo(50, 6);
    expect(measure("1.24s")).toBeCloseTo(50, 6);
    // Longest-first matching, so `min` is one unit rather than `m` plus letters.
    expect(measure("5min")).toBeCloseTo(40, 6);
    expect(measure("∑ 1.24s")).toBeCloseTo(70, 6);
  });

  it("corrects for a canvas that refused the font it was given", () => {
    // A real canvas keeps `10px sans-serif` when it rejects a font string, and
    // then measures 10px glyphs for a 12px label — 20% short, silently.
    const stubborn: { font: string; measureText: (t: string) => TextMetrics } =
      {
        font: "10px sans-serif",
        measureText: (text: string) =>
          ({ width: text.length * 10 }) as TextMetrics,
      };
    Object.defineProperty(stubborn, "font", {
      get: () => "10px sans-serif",
      set: () => undefined,
    });
    const measure = createTextMeasurerFrom(
      stubborn as unknown as CanvasRenderingContext2D,
      "20px test",
    ).measure;
    // Asked for 20px, measured at 10px: every width doubles back to the truth.
    expect(measure("abc")).toBeCloseTo(60, 6);
  });

  it("falls back to a flat per-letter width with no canvas", () => {
    expect(createTextMeasurerFrom(null).measure("1m 35s")).toBeCloseTo(
      6 * PX_PER_LETTER,
      6,
    );
  });
});
