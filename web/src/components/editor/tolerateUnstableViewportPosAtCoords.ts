import { type EditorView, ViewPlugin } from "@uiw/react-codemirror";

/**
 * After a failed CodeMirror measure (viewport did not stabilize), `lineAt` can
 * return null and `scanTile` reads `.length` on that null. `posAtCoords` and
 * `posAndSideAtCoords` already return null when a position cannot be resolved,
 * so treat this TypeError as an unresolved position.
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

export function wrapEditorViewCoordLookups(view: CoordLookupView): () => void {
  const originalPosAtCoords = view.posAtCoords as PosAtCoordsFn;
  const originalPosAndSideAtCoords =
    view.posAndSideAtCoords as PosAndSideAtCoordsFn;

  view.posAtCoords = ((coords, precise?: boolean) => {
    try {
      return originalPosAtCoords.call(view, coords, precise);
    } catch (error) {
      if (isCodeMirrorUnstableViewportError(error)) {
        return null;
      }
      throw error;
    }
  }) as EditorView["posAtCoords"];

  view.posAndSideAtCoords = ((coords, precise?: boolean) => {
    try {
      return originalPosAndSideAtCoords.call(view, coords, precise);
    } catch (error) {
      if (isCodeMirrorUnstableViewportError(error)) {
        return null;
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
