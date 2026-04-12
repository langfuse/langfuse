import { Baby, UserRound } from "lucide-react";
import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../ui/resizable";
import { SpielwieseAgentNodeStack } from "./SpielwieseAgentNodeStack";
import { SpielwieseEvaluationPane } from "./SpielwieseEvaluationPane";
import { SpielwiesePromptSimulationPane } from "./SpielwiesePromptSimulationPane";

type CanvasBottomPaneMode = "playground" | "evaluation";

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
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-[#15181C] px-2 pt-0 pb-2",
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

function CanvasPaneModeToggle({
  activeMode,
  onModeChange,
}: {
  activeMode: CanvasBottomPaneMode;
  onModeChange: (mode: CanvasBottomPaneMode) => void;
}) {
  const options: {
    icon: typeof Baby;
    id: CanvasBottomPaneMode;
    label: string;
  }[] = [
    {
      icon: Baby,
      id: "playground",
      label: "Playground",
    },
    {
      icon: UserRound,
      id: "evaluation",
      label: "Evaluation",
    },
  ];

  return (
    <div
      className="bg-muted/72 pointer-events-auto inline-flex items-center gap-1 overflow-hidden rounded-2xl p-1"
      data-testid="spielwiese-canvas-pane-mode-toggle"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = option.id === activeMode;

        return (
          <button
            aria-label={option.label}
            aria-pressed={isActive}
            className={cn(
              "text-muted-foreground hover:bg-background hover:text-foreground inline-flex h-7 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-medium transition-colors",
              isActive && "bg-background text-foreground",
            )}
            data-testid={`spielwiese-canvas-pane-mode-${option.id}`}
            key={option.id}
            onClick={() => onModeChange(option.id)}
            type="button"
          >
            <Icon className="size-3.5 shrink-0" />
            <span>{option.label}</span>
          </button>
        );
      })}
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
  const [bottomPaneMode, setBottomPaneMode] =
    useState<CanvasBottomPaneMode>("playground");
  const paneModeToggle = (
    <CanvasPaneModeToggle
      activeMode={bottomPaneMode}
      onModeChange={setBottomPaneMode}
    />
  );

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
        {bottomPaneMode === "playground" ? (
          <SpielwiesePromptSimulationPane
            headerAccessory={paneModeToggle}
            nodes={nodes}
          />
        ) : (
          <SpielwieseEvaluationPane
            headerAccessory={paneModeToggle}
            nodes={nodes}
          />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
