import { EditorView } from "@uiw/react-codemirror";
import { type Extension } from "@codemirror/state";

/**
 * Collects files from a drop/paste transfer, falling back to `items` for
 * sources (e.g. clipboard images) that don't populate `files`.
 */
function extractTransferFiles(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  if (data.files.length > 0) return Array.from(data.files);
  const files: File[] = [];
  for (const item of Array.from(data.items)) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

/**
 * CodeMirror extension that forwards dropped/pasted files to `onFiles` with the
 * insert position (drop coords / paste caret). Plain text is left to the editor.
 */
export function createFileDropPasteExtension({
  onFiles,
}: {
  onFiles: (files: File[], view: EditorView, anchor?: number) => void;
}): Extension {
  return EditorView.domEventHandlers({
    drop(event, view) {
      const files = extractTransferFiles(event.dataTransfer);
      if (files.length === 0) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      onFiles(files, view, pos ?? undefined);
      return true;
    },
    paste(event, view) {
      const files = extractTransferFiles(event.clipboardData);
      if (files.length === 0) return false;
      event.preventDefault();
      // Freeze the caret at paste time so an async upload can't drift the insert.
      onFiles(files, view, view.state.selection.main.from);
      return true;
    },
  });
}
