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

export function wrapEditorViewCoordLookups(view: CoordLookupView): () => void {
  const originalPosAtCoords = view.posAtCoords;
  const originalPosAndSideAtCoords = view.posAndSideAtCoords;

  view.posAtCoords = (coords, precise) => {
    try {
      return originalPosAtCoords.call(view, coords, precise);
    } catch (error) {
      if (isCodeMirrorUnstableViewportError(error)) {
        return null;
      }
      throw error;
    }
  };

  view.posAndSideAtCoords = (coords, precise) => {
    try {
      return originalPosAndSideAtCoords.call(view, coords, precise);
    } catch (error) {
      if (isCodeMirrorUnstableViewportError(error)) {
        return null;
      }
      throw error;
    }
  };

  return () => {
    view.posAtCoords = originalPosAtCoords;
    view.posAndSideAtCoords = originalPosAndSideAtCoords;
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
