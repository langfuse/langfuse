import { ResizablePanel } from "../ui/resizable";
import {
  SpielwieseCanvasPane,
  type SpielwieseCanvasPaneProps,
} from "./SpielwieseCanvasPane";

export function SpielwieseCanvasPaneMainPanel({
  chrome = "default",
  insertAnchorNodeId,
  nodes,
  onAgentNodeArchive,
  onNodesReplace,
  onAgentNodeInsert,
  onCloseSidePanels,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseCanvasPaneProps) {
  const pane = (
    <SpielwieseCanvasPane
      chrome={chrome}
      className="h-full"
      insertAnchorNodeId={insertAnchorNodeId}
      nodes={nodes}
      onAgentNodeArchive={onAgentNodeArchive}
      onNodesReplace={onNodesReplace}
      onAgentNodeInsert={onAgentNodeInsert}
      onCloseSidePanels={onCloseSidePanels}
      onPromptSectionDelete={onPromptSectionDelete}
      onPromptSectionInsert={onPromptSectionInsert}
      onPromptSectionChange={onPromptSectionChange}
      onPromptSectionMove={onPromptSectionMove}
      onSettingValueChange={onSettingValueChange}
      onTitleChange={onTitleChange}
    />
  );

  if (chrome === "onboarding-preview") {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        data-testid="spielwiese-canvas-main-panel"
      >
        {pane}
      </div>
    );
  }

  return (
    <ResizablePanel
      data-testid="spielwiese-canvas-main-panel"
      defaultSize="68%"
      minSize="20%"
    >
      {pane}
    </ResizablePanel>
  );
}
