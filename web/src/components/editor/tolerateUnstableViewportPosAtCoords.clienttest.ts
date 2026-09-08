// @vitest-environment jsdom

import {
  isCodeMirrorUnstableViewportError,
  wrapEditorViewCoordLookups,
} from "@/src/components/editor/tolerateUnstableViewportPosAtCoords";

const COORDS = { x: 10, y: 20 };

function createView(overrides?: {
  posAtCoords?: () => number | null;
  posAndSideAtCoords?: () => { pos: number; assoc: number } | null;
}) {
  return {
    posAtCoords: overrides?.posAtCoords ?? (() => 4),
    posAndSideAtCoords:
      overrides?.posAndSideAtCoords ?? (() => ({ pos: 4, assoc: 1 })),
  };
}

describe("isCodeMirrorUnstableViewportError", () => {
  it("matches the Chrome null-tile TypeError", () => {
    expect(
      isCodeMirrorUnstableViewportError(
        new TypeError("Cannot read properties of null (reading 'length')"),
      ),
    ).toBe(true);
  });

  it("does not match other TypeErrors or non-TypeErrors", () => {
    expect(
      isCodeMirrorUnstableViewportError(
        new TypeError("Cannot read properties of null (reading 'top')"),
      ),
    ).toBe(false);
    expect(isCodeMirrorUnstableViewportError(new Error("length"))).toBe(false);
    expect(isCodeMirrorUnstableViewportError("length")).toBe(false);
  });
});

describe("wrapEditorViewCoordLookups", () => {
  it("returns null when posAtCoords throws the null-tile TypeError", () => {
    const view = createView({
      posAtCoords: () => {
        throw new TypeError(
          "Cannot read properties of null (reading 'length')",
        );
      },
    });

    wrapEditorViewCoordLookups(view);

    expect(view.posAtCoords(COORDS)).toBeNull();
  });

  it("returns null when posAndSideAtCoords throws the null-tile TypeError", () => {
    const view = createView({
      posAndSideAtCoords: () => {
        throw new TypeError(
          "Cannot read properties of null (reading 'length')",
        );
      },
    });

    wrapEditorViewCoordLookups(view);

    expect(view.posAndSideAtCoords(COORDS)).toBeNull();
  });

  it("rethrows unrelated lookup errors", () => {
    const view = createView({
      posAtCoords: () => {
        throw new TypeError("Cannot read properties of null (reading 'top')");
      },
    });

    wrapEditorViewCoordLookups(view);

    expect(() => view.posAtCoords(COORDS)).toThrow(
      "Cannot read properties of null (reading 'top')",
    );
  });

  it("passes through successful lookups and restores the originals", () => {
    const view = createView();

    const restore = wrapEditorViewCoordLookups(view);

    expect(view.posAtCoords(COORDS)).toBe(4);
    expect(view.posAndSideAtCoords(COORDS)).toEqual({ pos: 4, assoc: 1 });

    restore();

    expect(view.posAtCoords(COORDS)).toBe(4);
  });
});
