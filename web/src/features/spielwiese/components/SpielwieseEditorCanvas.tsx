import type { SpielwieseDashboardVM } from "../types/dashboard";
import { SpielwieseCanvasPaneStack } from "./SpielwieseCanvasPaneStack";
import { useSpielwieseEditableCanvas } from "./useSpielwieseEditableCanvas";

type SpielwieseEditorCanvasProps = {
  canvas: SpielwieseDashboardVM["canvas"];
  onDetectedVariablesChange?: (labels: string[]) => void;
};

export function SpielwieseEditorCanvas({
  canvas,
  onDetectedVariablesChange,
}: SpielwieseEditorCanvasProps) {
  const editableCanvas = useSpielwieseEditableCanvas(
    canvas,
    onDetectedVariablesChange,
  );

  return (
    <section
      className="@container isolate flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="spielwiese-editor-canvas"
    >
      <SpielwieseCanvasPaneStack
        nodes={editableCanvas.nodes}
        onPromptSectionChange={editableCanvas.onPromptSectionChange}
        onPromptSectionDelete={editableCanvas.onPromptSectionDelete}
        onPromptSectionInsert={editableCanvas.onPromptSectionInsert}
        onPromptSectionMove={editableCanvas.onPromptSectionMove}
        onSettingValueChange={editableCanvas.onSettingValueChange}
        onTitleChange={editableCanvas.onTitleChange}
      />
    </section>
  );
}
