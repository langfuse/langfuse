import { type EditorView, ViewPlugin } from "@uiw/react-codemirror";

/**
 * After a failed CodeMirror measure (viewport did not stabilize), `lineAt` can
 * return null and `scanTile` reads `.length` on that null. Default
 * `posAtCoords` / `posAndSideAtCoords` already return null when a position
 * cannot be resolved. Callers that pass `precise: false` (mouse selection,
 * drops) require a non-null result, so fall back to the document start.
 */
export function isCodeMirrorUnstableViewportError(error: unknown): boolean {
  if (!(error instanceof TypeError)) {
    return false;
  }

  return (
    error.message === "Cannot read properties of null (reading 'length')" ||
    error.message === "Cannot read property 'length' of null" ||
    error.message === 'can\'t access property "length" of null'
  );
}

type CoordLookupView = {
  posAtCoords: EditorView["posAtCoords"];
  posAndSideAtCoords: EditorView["posAndSideAtCoords"];
};

type PosAtCoordsFn = (
  coords: { x: number; y: number },
  precise?: boolean,
) => number | null;

type PosAndSideAtCoordsFn = (
  coords: { x: number; y: number },
  precise?: boolean,
) => { pos: number; assoc: number } | null;

const IMPRECISE_SIDE_FALLBACK = { pos: 0, assoc: -1 } as const;

function fallbackForUnstableViewport(precise: boolean | undefined) {
  // precise === false is the mouse-selection / drop path; those callers read
  // .pos / .assoc (or the number) without a null check.
  if (precise === false) {
    return { pos: 0 as number | null, side: IMPRECISE_SIDE_FALLBACK };
  }
  return { pos: null as number | null, side: null };
}

export function wrapEditorViewCoordLookups(view: CoordLookupView): () => void {
  const originalPosAtCoords = view.posAtCoords as PosAtCoordsFn;
  const originalPosAndSideAtCoords =
    view.posAndSideAtCoords as PosAndSideAtCoordsFn;

  view.posAtCoords = ((coords, precise?: boolean) => {
    try {
      return originalPosAtCoords.call(view, coords, precise);
    } catch (error) {
      if (isCodeMirrorUnstableViewportError(error)) {
        return fallbackForUnstableViewport(precise).pos;
      }
      throw error;
    }
  }) as EditorView["posAtCoords"];

  view.posAndSideAtCoords = ((coords, precise?: boolean) => {
    try {
      return originalPosAndSideAtCoords.call(view, coords, precise);
    } catch (error) {
      if (isCodeMirrorUnstableViewportError(error)) {
        return fallbackForUnstableViewport(precise).side;
      }
      throw error;
    }
  }) as EditorView["posAndSideAtCoords"];

  return () => {
    view.posAtCoords = originalPosAtCoords as EditorView["posAtCoords"];
    view.posAndSideAtCoords =
      originalPosAndSideAtCoords as EditorView["posAndSideAtCoords"];
  };
}

export const tolerateUnstableViewportPosAtCoords = ViewPlugin.fromClass(
  class {
    private readonly restore: () => void;

    constructor(view: EditorView) {
      this.restore = wrapEditorViewCoordLookups(view);
    }

    destroy() {
      this.restore();
    }
  },
);
