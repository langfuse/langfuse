// @vitest-environment jsdom

import { type EditorView } from "@uiw/react-codemirror";
import {
  isCodeMirrorDetachedCompositionTileError,
  wrapEditorViewDetachedCompositionUpdates,
} from "@/src/components/editor/tolerateDetachedCompositionTile";

const cmTileError = () => {
  throw new TypeError("null is not an object (evaluating 't.cmTile')");
};

function createView(overrides?: { update?: EditorView["update"] }) {
  return {
    update: (overrides?.update ?? (() => undefined)) as EditorView["update"],
  };
}

describe("isCodeMirrorDetachedCompositionTileError", () => {
  it("matches Chrome, Firefox, and Safari null.cmTile TypeErrors", () => {
    expect(
      isCodeMirrorDetachedCompositionTileError(
        new TypeError("Cannot read properties of null (reading 'cmTile')"),
      ),
    ).toBe(true);
    expect(
      isCodeMirrorDetachedCompositionTileError(
        new TypeError("Cannot read property 'cmTile' of null"),
      ),
    ).toBe(true);
    expect(
      isCodeMirrorDetachedCompositionTileError(
        new TypeError('can\'t access property "cmTile" of null'),
      ),
    ).toBe(true);
    expect(
      isCodeMirrorDetachedCompositionTileError(
        new TypeError("null is not an object (evaluating 't.cmTile')"),
      ),
    ).toBe(true);
    expect(
      isCodeMirrorDetachedCompositionTileError(
        new TypeError("null is not an object (evaluating 't.cmTile')."),
      ),
    ).toBe(true);
  });

  it("does not match other TypeErrors or non-TypeErrors", () => {
    expect(
      isCodeMirrorDetachedCompositionTileError(
        new TypeError("Cannot read properties of null (reading 'length')"),
      ),
    ).toBe(false);
    expect(
      isCodeMirrorDetachedCompositionTileError(
        new TypeError("Cannot read properties of undefined (reading 'cmTile')"),
      ),
    ).toBe(false);
    expect(
      isCodeMirrorDetachedCompositionTileError(
        new TypeError("null is not an object (evaluating 't.parent')"),
      ),
    ).toBe(false);
    expect(isCodeMirrorDetachedCompositionTileError(new Error("cmTile"))).toBe(
      false,
    );
    expect(isCodeMirrorDetachedCompositionTileError("cmTile")).toBe(false);
  });
});

describe("wrapEditorViewDetachedCompositionUpdates", () => {
  it("swallows the detached-composition cmTile TypeError", () => {
    const view = createView({ update: cmTileError });

    wrapEditorViewDetachedCompositionUpdates(view);

    expect(() => view.update([])).not.toThrow();
  });

  it("rethrows unrelated update errors", () => {
    const view = createView({
      update: () => {
        throw new TypeError(
          "Cannot read properties of null (reading 'length')",
        );
      },
    });

    wrapEditorViewDetachedCompositionUpdates(view);

    expect(() => view.update([])).toThrow(
      "Cannot read properties of null (reading 'length')",
    );
  });

  it("passes through successful updates and restores the original", () => {
    const calls: unknown[] = [];
    const view = createView({
      update: ((transactions) => {
        calls.push(transactions);
      }) as EditorView["update"],
    });

    const restore = wrapEditorViewDetachedCompositionUpdates(view);

    view.update([]);
    expect(calls).toEqual([[]]);

    restore();
    view.update([]);
    expect(calls).toEqual([[], []]);
  });
});
