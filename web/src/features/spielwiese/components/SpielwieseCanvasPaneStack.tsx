import { cn } from "@/src/utils/tailwind";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../ui/resizable";
import { SpielwieseAgentNodeStack } from "./SpielwieseAgentNodeStack";
import { SpielwiesePromptSimulationPane } from "./SpielwiesePromptSimulationPane";

type SpielwieseCanvasPaneProps = {
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

function SpielwieseCanvasPane({
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
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-[#15181C] p-2",
        className,
      )}
      data-testid="spielwiese-editor-canvas-pane"
    >
      <div
        className="bg-background flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-[8px] px-4 py-0 shadow-xs sm:px-5"
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

export function SpielwieseCanvasPaneStack({
  nodes,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseCanvasPaneProps) {
  return (
    <ResizablePanelGroup
      className="flex-1 overflow-hidden"
      orientation="vertical"
    >
      <ResizablePanel defaultSize="68%" minSize="20%">
        <SpielwieseCanvasPane
          className="h-full rounded-none"
          nodes={nodes}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionMove={onPromptSectionMove}
          onSettingValueChange={onSettingValueChange}
          onTitleChange={onTitleChange}
        />
      </ResizablePanel>
      <ResizableHandle
        className="aria-[orientation=horizontal]:hover:ring-border/70 h-px shrink-0 bg-[#15181C] aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:hover:ring-1"
        data-testid="spielwiese-canvas-pane-resize-handle"
      />
      <ResizablePanel defaultSize="32%" minSize="12%">
        <SpielwiesePromptSimulationPane nodes={nodes} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
