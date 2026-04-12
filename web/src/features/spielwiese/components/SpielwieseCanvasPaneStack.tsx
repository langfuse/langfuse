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

const paneModeToggleClassName =
  "pointer-events-auto inline-flex items-center gap-1 rounded-[11px] border border-[rgba(0,0,0,0.06)] bg-[rgba(255,255,255,0.52)] p-0.5";

const paneModeToggleButtonClassName =
  "text-foreground/50 hover:text-foreground/72 inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3.5 text-[0.75rem] font-medium tracking-[0.01em] transition-colors outline-none focus-visible:ring-0";

const paneModeToggleButtonActiveClassName =
  "bg-white text-[#202427] shadow-[0_1px_2px_rgba(15,23,42,0.08)]";

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
      className={paneModeToggleClassName}
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
              paneModeToggleButtonClassName,
              isActive && paneModeToggleButtonActiveClassName,
            )}
            data-testid={`spielwiese-canvas-pane-mode-${option.id}`}
            key={option.id}
            onClick={() => onModeChange(option.id)}
            type="button"
          >
            <Icon className="size-4 shrink-0" />
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
        className="aria-[orientation=horizontal]:hover:ring-border/70 h-px shrink-0 bg-[#F3F3F4] aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:hover:ring-1"
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
