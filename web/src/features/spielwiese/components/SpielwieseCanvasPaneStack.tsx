import { Baby, CheckCircle2, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../ui/resizable";
import { SpielwieseAgentNodeStack } from "./SpielwieseAgentNodeStack";
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

function getNodeResponseFormat(
  node: SpielwieseDashboardVM["canvas"]["agentNodes"][number],
) {
  return node.settings.find((setting) => setting.id === "response-format")
    ?.value;
}

function getEvaluationRows(
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
) {
  return nodes.map((node) => {
    const responseFormat = getNodeResponseFormat(node);
    const usesJson = responseFormat === "json";

    return {
      detail: usesJson
        ? "Structured sample output is ready for downstream handoff."
        : "Final answer stays readable and user-facing instead of structured.",
      id: node.id,
      statusLabel: usesJson ? "Valid JSON" : "Readable",
      title: usesJson
        ? `${node.title} schema check`
        : `${node.title} response check`,
    };
  });
}

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

function EvaluationHeader({ count }: { count: number }) {
  return (
    <div className="min-w-0" data-testid="spielwiese-evaluation-header">
      <p
        className="text-foreground/54 text-[0.75rem] font-medium tracking-[0.02em]"
        data-testid="spielwiese-evaluation-title"
      >
        Evaluation
      </p>
      <p className="text-foreground/46 mt-1 text-[11px] leading-5">
        Quick checks across the current workflow chain.
      </p>
      <span className="text-foreground/54 mt-2 inline-flex rounded-full border border-black/6 bg-[#F7F7F7] px-2.5 py-1 text-[11px] font-medium">
        {count} checks
      </span>
    </div>
  );
}

function EvaluationCard({
  detail,
  statusLabel,
  title,
}: {
  detail: string;
  statusLabel: string;
  title: string;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-[12px] border border-[rgba(0,0,0,0.06)] bg-[#FBFBFB] px-3 py-3"
      data-testid="spielwiese-evaluation-card"
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[rgba(16,163,127,0.12)] text-[#0F8C67]">
        <CheckCircle2 className="size-4 shrink-0" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-foreground text-sm font-medium">{title}</p>
          <span className="text-foreground/54 rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-medium tracking-[0.04em] uppercase">
            {statusLabel}
          </span>
        </div>
        <p className="text-foreground/58 mt-1 text-[12px] leading-5">
          {detail}
        </p>
      </div>
    </div>
  );
}

function SpielwieseEvaluationPane({
  headerAccessory,
  nodes,
}: {
  headerAccessory?: ReactNode;
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
}) {
  const evaluationRows = getEvaluationRows(nodes);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-none bg-[#15181C] p-2"
      data-testid="spielwiese-evaluation-pane"
    >
      <div className="bg-background flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-[8px] px-4 py-0 shadow-xs">
        <div
          className="sticky top-0 z-10 -mx-4 flex w-[calc(100%+2rem)] items-start gap-3 border-b border-black/5 bg-[rgba(251,251,251,0.82)] px-4 pt-3 pb-3 supports-[backdrop-filter]:bg-[rgba(251,251,251,0.72)] supports-[backdrop-filter]:backdrop-blur-md"
          data-testid="spielwiese-evaluation-header-bar"
        >
          <EvaluationHeader count={evaluationRows.length} />
          {headerAccessory ? (
            <div
              className="ml-auto shrink-0"
              data-testid="spielwiese-evaluation-header-accessory"
            >
              {headerAccessory}
            </div>
          ) : null}
        </div>
        <div
          className="flex flex-col gap-2 pt-3 pb-3"
          data-testid="spielwiese-evaluation-list"
        >
          {evaluationRows.map((row) => (
            <EvaluationCard
              detail={row.detail}
              key={row.id}
              statusLabel={row.statusLabel}
              title={row.title}
            />
          ))}
        </div>
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
