import { Baby, CircleQuestionMark, UserRound } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { cn } from "@/src/utils/tailwind";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ResizablePanelHandle,
} from "../ui/resizable";
import {
  SpielwieseCanvasPane,
  type SpielwieseCanvasPaneProps,
} from "./SpielwieseCanvasPane";
import { SpielwieseEvaluationPane } from "./SpielwieseEvaluationPane";
import { SpielwiesePromptSimulationPane } from "./SpielwiesePromptSimulationPane";

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

function getEvaluationOverflowInPixels(shellElement: HTMLDivElement | null) {
  if (!shellElement) {
    return 0;
  }

  return Math.max(shellElement.scrollHeight - shellElement.clientHeight, 0);
}

function expandBottomPaneToFitEvaluation({
  bottomPanelRef,
  extraBottomSpace = 8,
  shellElement,
}: {
  bottomPanelRef: RefObject<ResizablePanelHandle | null>;
  extraBottomSpace?: number;
  shellElement: HTMLDivElement | null;
}) {
  const overflowInPixels = getEvaluationOverflowInPixels(shellElement);
  const bottomPanel = bottomPanelRef.current;

  if (!bottomPanel || overflowInPixels <= 0) {
    return;
  }

  bottomPanel.resize(
    bottomPanel.getSize().inPixels + overflowInPixels + extraBottomSpace,
  );
}

function scheduleBottomPaneFit({
  bottomPanelRef,
  evaluationShellRef,
}: {
  bottomPanelRef: RefObject<ResizablePanelHandle | null>;
  evaluationShellRef: RefObject<HTMLDivElement | null>;
}) {
  window.setTimeout(() => {
    expandBottomPaneToFitEvaluation({
      bottomPanelRef,
      shellElement: evaluationShellRef.current,
    });
  }, 0);
}

function useEvaluationPaneFit() {
  const bottomPanelRef = useRef<ResizablePanelHandle | null>(null);
  const evaluationShellRef = useRef<HTMLDivElement | null>(null);
  const requestBottomPaneFit = () =>
    scheduleBottomPaneFit({
      bottomPanelRef,
      evaluationShellRef,
    });

  return {
    bottomPanelRef,
    evaluationShellRef,
    requestBottomPaneFit,
  };
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

  return (
    <ResizablePanelGroup
      className="flex-1 overflow-hidden"
      orientation="vertical"
    >
      <ResizablePanel
        data-testid="spielwiese-canvas-main-panel"
        defaultSize="68%"
        minSize="20%"
      >
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
    </ResizablePanelGroup>
  );
}
