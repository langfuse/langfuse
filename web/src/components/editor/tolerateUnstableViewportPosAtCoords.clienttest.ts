// @vitest-environment jsdom

import { type EditorView } from "@uiw/react-codemirror";
import {
  isCodeMirrorUnstableViewportError,
  wrapEditorViewCoordLookups,
} from "@/src/components/editor/tolerateUnstableViewportPosAtCoords";

const COORDS = { x: 10, y: 20 };

function createView(overrides?: {
  posAtCoords?: (
    coords: { x: number; y: number },
    precise?: boolean,
  ) => number | null;
  posAndSideAtCoords?: (
    coords: { x: number; y: number },
    precise?: boolean,
  ) => { pos: number; assoc: number } | null;
}) {
  return {
    posAtCoords: (overrides?.posAtCoords ??
      (() => 4)) as EditorView["posAtCoords"],
    posAndSideAtCoords: (overrides?.posAndSideAtCoords ??
      (() => ({ pos: 4, assoc: 1 }))) as EditorView["posAndSideAtCoords"],
  };
}

const nullTileError = () => {
  throw new TypeError("Cannot read properties of null (reading 'length')");
};

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
  it("returns null when precise lookups throw the null-tile TypeError", () => {
    const view = createView({
      posAtCoords: nullTileError,
      posAndSideAtCoords: nullTileError,
    });

    wrapEditorViewCoordLookups(view);

    expect(view.posAtCoords(COORDS)).toBeNull();
    expect(view.posAndSideAtCoords(COORDS)).toBeNull();
  });

  it("returns a non-null fallback when imprecise lookups throw", () => {
    const view = createView({
      posAtCoords: nullTileError,
      posAndSideAtCoords: nullTileError,
    });

    wrapEditorViewCoordLookups(view);

    expect(view.posAtCoords(COORDS, false)).toBe(0);
    expect(view.posAndSideAtCoords(COORDS, false)).toEqual({
      pos: 0,
      assoc: -1,
    });
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
