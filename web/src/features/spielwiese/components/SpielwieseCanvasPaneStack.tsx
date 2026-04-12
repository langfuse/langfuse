import { Baby, UserRound } from "lucide-react";
import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../ui/resizable";
import {
  SpielwieseCanvasPane,
  type SpielwieseCanvasPaneProps,
} from "./SpielwieseCanvasPane";
import { SpielwieseEvaluationPane } from "./SpielwieseEvaluationPane";
import { SpielwiesePromptSimulationPane } from "./SpielwiesePromptSimulationPane";
import {
  spielwieseHeaderButtonBaseClassName,
  spielwieseHeaderButtonSelectedClassName,
} from "./spielwieseHeaderButtonStyles";

type CanvasBottomPaneMode = "playground" | "evaluation";

const paneModeToggleClassName =
  "pointer-events-auto inline-flex items-center gap-1";

const paneModeToggleButtonClassName = `${spielwieseHeaderButtonBaseClassName} inline-flex h-6 items-center gap-1.25 rounded-[10px] py-0 pr-2 pl-1.5 text-[11px] font-medium tracking-[0.01em]`;

const paneModeToggleButtonActiveClassName =
  spielwieseHeaderButtonSelectedClassName;

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
            <Icon className="size-3 shrink-0" />
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
