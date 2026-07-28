import { getLevelColors, LevelColors } from "@/src/components/level-colors";

describe("getLevelColors", () => {
  it("returns the correct style for each known level", () => {
    expect(getLevelColors("DEFAULT")).toEqual(LevelColors.DEFAULT);
    expect(getLevelColors("DEBUG")).toEqual(LevelColors.DEBUG);
    expect(getLevelColors("WARNING")).toEqual(LevelColors.WARNING);
    expect(getLevelColors("ERROR")).toEqual(LevelColors.ERROR);
  });

  // Level is user-/OTel-controlled data (an open string, not a closed enum), so
  // every one of these must return the neutral fallback rather than throw.
  it.each([
    ["INFO (OTel severity)", "INFO"],
    ["lowercase info", "info"],
    ["empty string", ""],
    ["a made-up custom level", "SUPER_CRITICAL"],
  ])(
    "returns the neutral fallback for %s without throwing",
    (_label, level) => {
      expect(() => getLevelColors(level)).not.toThrow();
      expect(getLevelColors(level)).toEqual({ text: "", bg: "" });
    },
  );

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])(
    "returns the neutral fallback for %s without throwing",
    (_label, level) => {
      expect(() => getLevelColors(level)).not.toThrow();
      expect(getLevelColors(level)).toEqual({ text: "", bg: "" });
    },
  );

  it("always returns an object exposing .bg and .text (safe to dereference)", () => {
    for (const level of ["ERROR", "INFO", "", null, undefined]) {
      const colors = getLevelColors(level);
      expect(typeof colors.bg).toBe("string");
      expect(typeof colors.text).toBe("string");
    }
  });
});
