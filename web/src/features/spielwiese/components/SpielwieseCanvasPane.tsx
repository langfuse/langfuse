import { cn } from "@/src/utils/tailwind";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import { SpielwieseAgentNodeStack } from "./SpielwieseAgentNodeStack";

export type SpielwieseCanvasPaneProps = {
  className?: string;
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
  onPromptSectionDelete: (nodeId: string, sectionId: string) => void;
  onPromptSectionInsert: (
    nodeId: string,
    kind: "user" | "system" | "assistant" | "tool",
  ) => void;
  onPromptSectionChange: (
    nodeId: string,
    sectionId: string,
    value: string,
  ) => void;
  onPromptSectionMove: (
    nodeId: string,
    sectionId: string,
    direction: "up" | "down",
  ) => void;
  onSettingValueChange: (
    nodeId: string,
    settingId: string,
    value: string,
  ) => void;
  onTitleChange: (nodeId: string, value: string) => void;
};

export function SpielwieseCanvasPane({
  className,
  nodes,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseCanvasPaneProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F3F3F4] px-0 pt-0 pb-2",
        className,
      )}
      data-testid="spielwiese-editor-canvas-pane"
    >
      <div
        className="bg-background flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-[8px] px-0 py-0 shadow-xs"
        data-testid="spielwiese-editor-canvas-pane-shell"
      >
        <SpielwieseAgentNodeStack
          nodes={nodes}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionMove={onPromptSectionMove}
          onSettingValueChange={onSettingValueChange}
          onTitleChange={onTitleChange}
        />
      </div>
    </div>
  );
}
