import type { SpielwieseDashboardVM } from "../types/dashboard";
import { SpielwieseAgentNodeStack } from "./SpielwieseAgentNodeStack";

type SpielwieseCanvasPaneProps = {
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
  onPromptSectionChange: (
    nodeId: string,
    sectionId: string,
    value: string,
  ) => void;
  onSettingValueChange: (
    nodeId: string,
    settingId: string,
    value: string,
  ) => void;
  onTitleChange: (nodeId: string, value: string) => void;
};

function SpielwieseCanvasPane({
  nodes,
  onPromptSectionChange,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseCanvasPaneProps) {
  return (
    <div
      className="border-border/70 bg-card/95 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border px-4 pt-4 pb-0 shadow-xs sm:px-5 sm:pt-5"
      data-testid="spielwiese-editor-canvas-pane"
    >
      <div className="flex min-h-0 flex-1 flex-col pb-0">
        <SpielwieseAgentNodeStack
          nodes={nodes}
          onPromptSectionChange={onPromptSectionChange}
          onSettingValueChange={onSettingValueChange}
          onTitleChange={onTitleChange}
        />
      </div>
    </div>
  );
}

export function SpielwieseCanvasPaneStack({
  nodes,
  onPromptSectionChange,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseCanvasPaneProps) {
  return (
    <SpielwieseCanvasPane
      nodes={nodes}
      onPromptSectionChange={onPromptSectionChange}
      onSettingValueChange={onSettingValueChange}
      onTitleChange={onTitleChange}
    />
  );
}
