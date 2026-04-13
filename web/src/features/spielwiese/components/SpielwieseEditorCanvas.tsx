import type { SpielwieseDashboardVM } from "../types/dashboard";
import { SpielwieseCanvasPaneStack } from "./SpielwieseCanvasPaneStack";
import {
  SpielwieseEditorCanvasChromeProvider,
  type SpielwieseEditorCanvasChrome,
} from "./SpielwieseEditorCanvasChromeContext";
import { useSpielwieseEditableCanvas } from "./useSpielwieseEditableCanvas";

type SpielwieseEditorCanvasProps = {
  canvas: SpielwieseDashboardVM["canvas"];
  chrome?: SpielwieseEditorCanvasChrome;
  onNodesChange?: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => void;
  onCloseSidePanels?: () => void;
  onDetectedVariablesChange?: (labels: string[]) => void;
};

export function SpielwieseEditorCanvas({
  canvas,
  chrome = "default",
  onNodesChange,
  onCloseSidePanels,
  onDetectedVariablesChange,
}: SpielwieseEditorCanvasProps) {
  const editableCanvas = useSpielwieseEditableCanvas(
    canvas,
    onDetectedVariablesChange,
    onNodesChange,
  );

  return (
    <SpielwieseEditorCanvasChromeProvider chrome={chrome}>
      <section
        className="@container isolate flex h-full min-h-0 flex-1 flex-col overflow-hidden"
        data-testid="spielwiese-editor-canvas"
      >
        <SpielwieseCanvasPaneStack
          chrome={chrome}
          insertAnchorNodeId={editableCanvas.insertAnchorNodeId}
          onNodesReplace={editableCanvas.onNodesReplace}
          onAgentNodeArchive={editableCanvas.onAgentNodeArchive}
          onAgentNodeInsert={editableCanvas.onAgentNodeInsert}
          onCloseSidePanels={onCloseSidePanels}
          nodes={editableCanvas.nodes}
          onPromptSectionChange={editableCanvas.onPromptSectionChange}
          onPromptSectionDelete={editableCanvas.onPromptSectionDelete}
          onPromptSectionInsert={editableCanvas.onPromptSectionInsert}
          onPromptSectionMove={editableCanvas.onPromptSectionMove}
          onSettingValueChange={editableCanvas.onSettingValueChange}
          onTitleChange={editableCanvas.onTitleChange}
        />
      </section>
    </SpielwieseEditorCanvasChromeProvider>
  );
}
