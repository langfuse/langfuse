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
 * CodeMirror extension that intercepts files dropped onto or pasted into the
 * editor and forwards them to `onFiles`. For drops the cursor is moved to the
 * drop position first (so the handler can insert there); pastes use the current
 * cursor. Only intercepts when files are present, so plain text drop/paste is
 * left to the editor's native handling. Callers implement `onFiles` for their
 * domain, e.g. uploading media and inserting a reference string at the cursor.
 */
export function createFileDropPasteExtension({
  onFiles,
}: {
  onFiles: (files: File[], view: EditorView) => void;
}): Extension {
  return EditorView.domEventHandlers({
    drop(event, view) {
      const files = extractTransferFiles(event.dataTransfer);
      if (files.length === 0) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos != null) view.dispatch({ selection: { anchor: pos } });
      onFiles(files, view);
      return true;
    },
    paste(event, view) {
      const files = extractTransferFiles(event.clipboardData);
      if (files.length === 0) return false;
      event.preventDefault();
      onFiles(files, view);
      return true;
    },
  });
}
