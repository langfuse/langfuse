import { type EditorView, ViewPlugin } from "@uiw/react-codemirror";
import { isCodeMirrorDetachedCompositionTileMessage } from "@/src/utils/isCodeMirrorDetachedCompositionTileMessage";

/**
 * After compositionend, CodeMirror schedules `view.update([])` to clear the
 * composition view. That update walks `Tile.get(parent)` (`return parent.cmTile`).
 * When the composition node is already detached, parent is null and the
 * engines throw a TypeError on `.cmTile`.
 *
 * Default `view.update` has no recovery. Swallowing this vendor TypeError
 * leaves the document as it was before the failed update; rethrowing does
 * not recover the change either, it only becomes an unhandled setTimeout
 * exception.
 */
export function isCodeMirrorDetachedCompositionTileError(
  error: unknown,
): boolean {
  if (!(error instanceof TypeError)) {
    return false;
  }

  return isCodeMirrorDetachedCompositionTileMessage(error.message);
}

type UpdateView = {
  update: EditorView["update"];
};

export function wrapEditorViewDetachedCompositionUpdates(
  view: UpdateView,
): () => void {
  const originalUpdate = view.update;

  view.update = ((...args: Parameters<EditorView["update"]>) => {
    try {
      return originalUpdate.apply(view, args);
    } catch (error) {
      if (isCodeMirrorDetachedCompositionTileError(error)) {
        return;
      }
      throw error;
    }
  }) as EditorView["update"];

  return () => {
    view.update = originalUpdate;
  };
}

export const tolerateDetachedCompositionTile = ViewPlugin.fromClass(
  class {
    private readonly restore: () => void;

    constructor(view: EditorView) {
      this.restore = wrapEditorViewDetachedCompositionUpdates(view);
    }

    destroy() {
      this.restore();
    }
  },
);
