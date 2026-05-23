import { Baby, CircleQuestionMark, UserRound } from "lucide-react";
import { useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/src/utils/tailwind";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ResizablePanelHandle,
} from "../ui/resizable";
import { type SpielwieseCanvasPaneProps } from "./SpielwieseCanvasPane";
import { SpielwieseCanvasPaneMainPanel } from "./SpielwieseCanvasPaneMainPanel";
import { isOnboardingChrome } from "./SpielwieseEditorCanvasChromeContext";
import { SpielwieseEvaluationPane } from "./SpielwieseEvaluationPane";
import { SpielwiesePromptSimulationPane } from "./SpielwiesePromptSimulationPane";
import { useEvaluationPaneFit } from "./spielwieseCanvasPaneSizing";

type CanvasBottomPaneMode = "playground" | "evaluation";

const paneModeTooltipCopy =
  "Playground is for quick, interactive prompt and model iteration. Evaluation is for structured scoring, datasets, and repeatable regression checks.";
const paneModeTooltipDocsHref = "https://langfuse.com/docs";

const paneModeToggleClassName =
  "pointer-events-auto inline-flex items-center gap-px rounded-[8px] bg-[#F7F7F7] p-0 ring-1 ring-black/5";

const paneModeToggleButtonClassName =
  "text-foreground/62 hover:text-foreground inline-flex h-6 min-w-24 items-center justify-center gap-1.25 rounded-[8px] px-2 py-0 text-[11px] font-medium tracking-[0.01em] transition-colors outline-none focus-visible:ring-0";

const paneModeToggleButtonActiveClassName =
  "bg-white text-[#202427] shadow-[0_1px_2px_rgba(15,23,42,0.08)]";
const paneModeToggleButtonInertClassName = "pointer-events-none cursor-default";
const paneModeTooltipClassName =
  "text-foreground/72 pointer-events-none invisible absolute top-full left-0 z-20 mt-2 w-[17rem] translate-y-1 rounded-[12px] bg-[rgba(255,255,255,0.98)] px-3 py-2 text-left text-[0.6875rem] leading-[1.05rem] font-normal opacity-0 shadow-[0_16px_40px_rgba(15,23,42,0.12),0_4px_14px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-focus-within/pane-mode-tooltip:pointer-events-auto group-focus-within/pane-mode-tooltip:visible group-focus-within/pane-mode-tooltip:translate-y-0 group-focus-within/pane-mode-tooltip:opacity-100 group-hover/pane-mode-tooltip:pointer-events-auto group-hover/pane-mode-tooltip:visible group-hover/pane-mode-tooltip:translate-y-0 group-hover/pane-mode-tooltip:opacity-100";

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
        const isInert = option.id === "evaluation";

        return (
          <button
            aria-disabled={isInert ? true : undefined}
            aria-label={option.label}
            aria-pressed={isActive}
            className={cn(
              paneModeToggleButtonClassName,
              isInert && paneModeToggleButtonInertClassName,
              isActive && paneModeToggleButtonActiveClassName,
            )}
            data-testid={`spielwiese-canvas-pane-mode-${option.id}`}
            key={option.id}
            tabIndex={isInert ? -1 : undefined}
            onClick={isInert ? undefined : () => onModeChange(option.id)}
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

function CanvasPaneModeInfoTooltip() {
  return (
    <div
      className="text-foreground/46 group/pane-mode-tooltip relative inline-flex size-3.5 items-center justify-center outline-none after:absolute after:top-full after:left-0 after:h-2 after:w-[17rem] after:content-['']"
      data-testid="spielwiese-canvas-pane-mode-info-affordance"
      tabIndex={0}
    >
      <CircleQuestionMark
        aria-hidden="true"
        className="size-3 shrink-0 stroke-[2.2px]"
        data-testid="spielwiese-canvas-pane-mode-info-icon"
      />
      <div
        className={paneModeTooltipClassName}
        data-testid="spielwiese-canvas-pane-mode-tooltip"
        role="tooltip"
      >
        <p>
          {paneModeTooltipCopy}{" "}
          <a
            className="text-foreground inline font-medium underline underline-offset-2"
            data-testid="spielwiese-canvas-pane-mode-docs-link"
            href={paneModeTooltipDocsHref}
            rel="noreferrer"
            target="_blank"
          >
            Docs
          </a>
        </p>
      </div>
    </div>
  );
}

function CanvasPaneHeaderAccessory({
  activeMode,
  onModeChange,
}: {
  activeMode: CanvasBottomPaneMode;
  onModeChange: (mode: CanvasBottomPaneMode) => void;
}) {
  return (
    <div className="pointer-events-auto inline-flex items-center gap-1">
      <CanvasPaneModeToggle
        activeMode={activeMode}
        onModeChange={onModeChange}
      />
      <CanvasPaneModeInfoTooltip />
    </div>
  );
}

function createPaneModeChangeHandler({
  requestBottomPaneFit,
  setBottomPaneMode,
}: {
  requestBottomPaneFit: () => void;
  setBottomPaneMode: (mode: CanvasBottomPaneMode) => void;
}) {
  return (nextMode: CanvasBottomPaneMode) => {
    setBottomPaneMode(nextMode);

    if (nextMode === "evaluation") {
      requestBottomPaneFit();
    }
  };
}

function CanvasPaneBottomPanel({
  bottomPaneMode,
  bottomPanelRef,
  evaluationShellRef,
  nodes,
  paneModeToggle,
  requestBottomPaneFit,
}: {
  bottomPaneMode: CanvasBottomPaneMode;
  bottomPanelRef: RefObject<ResizablePanelHandle | null>;
  evaluationShellRef: RefObject<HTMLDivElement | null>;
  nodes: SpielwieseCanvasPaneProps["nodes"];
  paneModeToggle: ReactNode;
  requestBottomPaneFit: () => void;
}) {
  return (
    <ResizablePanel
      data-testid="spielwiese-canvas-bottom-panel"
      defaultSize="32%"
      minSize="12%"
      panelRef={bottomPanelRef}
    >
      {bottomPaneMode === "playground" ? (
        <SpielwiesePromptSimulationPane
          headerAccessory={paneModeToggle}
          nodes={nodes}
        />
      ) : (
        <SpielwieseEvaluationPane
          headerAccessory={paneModeToggle}
          nodes={nodes}
          onRequestFit={requestBottomPaneFit}
          shellRef={evaluationShellRef}
        />
      )}
    </ResizablePanel>
  );
}

// eslint-disable-next-line max-lines-per-function
export function SpielwieseCanvasPaneStack({
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
  const [bottomPaneMode, setBottomPaneMode] =
    useState<CanvasBottomPaneMode>("playground");
  const { bottomPanelRef, evaluationShellRef, requestBottomPaneFit } =
    useEvaluationPaneFit();
  const paneModeToggle = (
    <CanvasPaneHeaderAccessory
      activeMode={bottomPaneMode}
      onModeChange={createPaneModeChangeHandler({
        requestBottomPaneFit,
        setBottomPaneMode,
      })}
    />
  );

  if (isOnboardingChrome(chrome)) {
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SpielwieseCanvasPaneMainPanel
          chrome={chrome}
          insertAnchorNodeId={insertAnchorNodeId}
          nodes={nodes}
          onAgentNodeArchive={onAgentNodeArchive}
          onNodesReplace={onNodesReplace}
          onAgentNodeInsert={onAgentNodeInsert}
          onCloseSidePanels={onCloseSidePanels}
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onPromptSectionMove={onPromptSectionMove}
          onSettingValueChange={onSettingValueChange}
          onTitleChange={onTitleChange}
        />
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      className="flex-1 overflow-hidden"
      orientation="vertical"
    >
      <SpielwieseCanvasPaneMainPanel
        chrome={chrome}
        insertAnchorNodeId={insertAnchorNodeId}
        nodes={nodes}
        onAgentNodeArchive={onAgentNodeArchive}
        onNodesReplace={onNodesReplace}
        onAgentNodeInsert={onAgentNodeInsert}
        onCloseSidePanels={onCloseSidePanels}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onSettingValueChange={onSettingValueChange}
        onTitleChange={onTitleChange}
      />
      <ResizableHandle
        className="h-4 shrink-0 bg-transparent aria-[orientation=horizontal]:h-4"
        data-testid="spielwiese-canvas-pane-resize-handle"
      />
      <CanvasPaneBottomPanel
        bottomPaneMode={bottomPaneMode}
        bottomPanelRef={bottomPanelRef}
        evaluationShellRef={evaluationShellRef}
        nodes={nodes}
        paneModeToggle={paneModeToggle}
        requestBottomPaneFit={requestBottomPaneFit}
      />
    </ResizablePanelGroup>
  );
}
