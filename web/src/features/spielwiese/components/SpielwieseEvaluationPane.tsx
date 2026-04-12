import { useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import {
  evaluationStrategies,
  initialStrategyConfigs,
  patchStrategyConfig,
  type EvaluationStrategy,
  type EvaluationStrategyConfigs,
  type EvaluationStrategyId,
} from "./spielwieseEvaluationPaneConfig";
import { EvaluationStrategyDetail } from "./spielwieseEvaluationPaneDetail";

function EvaluationStrategyButton({
  isActive,
  onClick,
  strategy,
}: {
  isActive: boolean;
  onClick: () => void;
  strategy: EvaluationStrategy;
}) {
  return (
    <button
      aria-label={strategy.label}
      aria-pressed={isActive}
      className={cn(
        "border-border/40 hover:bg-background flex w-[10rem] shrink-0 items-start gap-3 rounded-[12px] border bg-[#FBFBFB] px-3 py-3 text-left transition-colors",
        isActive && "bg-background ring-1 ring-black/6",
      )}
      data-testid={`spielwiese-evaluation-strategy-${strategy.id}`}
      type="button"
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm font-medium">{strategy.label}</p>
        <p className="text-foreground/58 mt-1 text-[12px] leading-5">
          {strategy.description}
        </p>
      </div>
    </button>
  );
}

function EvaluationStrategyList({
  activeStrategyId,
  onSelect,
}: {
  activeStrategyId: EvaluationStrategyId;
  onSelect: (strategyId: EvaluationStrategyId) => void;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      data-testid="spielwiese-evaluation-strategy-list"
    >
      {evaluationStrategies.map((strategy) => (
        <EvaluationStrategyButton
          isActive={strategy.id === activeStrategyId}
          key={strategy.id}
          strategy={strategy}
          onClick={() => onSelect(strategy.id)}
        />
      ))}
    </div>
  );
}

function useEvaluationStrategyState() {
  const [activeStrategyId, setActiveStrategyId] =
    useState<EvaluationStrategyId>("llm-judge");
  const [strategyConfigs, setStrategyConfigs] =
    useState<EvaluationStrategyConfigs>(initialStrategyConfigs);
  const activeStrategy =
    evaluationStrategies.find((strategy) => strategy.id === activeStrategyId) ??
    evaluationStrategies[0];

  return {
    activeStrategy,
    activeStrategyId,
    setActiveStrategyId,
    setStrategyConfigs,
    strategyConfigs,
  };
}

function EvaluationPaneHeader({
  headerAccessory,
}: {
  headerAccessory?: ReactNode;
}) {
  return (
    <div
      className="sticky top-0 z-10 -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 rounded-t-[8px] border-b border-black/5 bg-[rgba(251,251,251,0.82)] pt-3 pr-3 pb-3 pl-[13px] supports-[backdrop-filter]:bg-[rgba(251,251,251,0.72)] supports-[backdrop-filter]:backdrop-blur-md"
      data-testid="spielwiese-evaluation-header-bar"
    >
      {headerAccessory ? (
        <div
          className="shrink-0"
          data-testid="spielwiese-evaluation-header-accessory"
        >
          {headerAccessory}
        </div>
      ) : null}
    </div>
  );
}

function EvaluationPaneContent({
  activeStrategy,
  activeStrategyId,
  nodes,
  onRequestFit,
  setActiveStrategyId,
  setStrategyConfigs,
  strategyConfigs,
}: {
  activeStrategy: EvaluationStrategy;
  activeStrategyId: EvaluationStrategyId;
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
  onRequestFit?: () => void;
  setActiveStrategyId: (strategyId: EvaluationStrategyId) => void;
  setStrategyConfigs: (
    value:
      | EvaluationStrategyConfigs
      | ((current: EvaluationStrategyConfigs) => EvaluationStrategyConfigs),
  ) => void;
  strategyConfigs: EvaluationStrategyConfigs;
}) {
  return (
    <div
      className="flex flex-col gap-3 pt-3 pb-3"
      data-testid="spielwiese-evaluation-content"
    >
      <EvaluationStrategyList
        activeStrategyId={activeStrategyId}
        onSelect={(strategyId) => {
          setActiveStrategyId(strategyId);
          onRequestFit?.();
        }}
      />
      <EvaluationStrategyDetail
        config={strategyConfigs[activeStrategy.id]}
        nodesCount={nodes.length}
        onUpdate={(patch) =>
          setStrategyConfigs((current) =>
            patchStrategyConfig(current, activeStrategy.id, patch),
          )
        }
        strategy={activeStrategy}
      />
    </div>
  );
}

export function SpielwieseEvaluationPane({
  headerAccessory,
  nodes,
  onRequestFit,
  shellRef,
}: {
  headerAccessory?: ReactNode;
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
  onRequestFit?: () => void;
  shellRef?: RefObject<HTMLDivElement | null>;
}) {
  const {
    activeStrategy,
    activeStrategyId,
    setActiveStrategyId,
    setStrategyConfigs,
    strategyConfigs,
  } = useEvaluationStrategyState();

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F3F3F4] px-0 pt-0 pb-0"
      data-testid="spielwiese-evaluation-pane"
    >
      <div
        className="bg-background relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-[8px] px-4 pt-0 pb-[6px] shadow-xs after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-[6px] after:bg-[#F3F3F4] after:content-['']"
        data-testid="spielwiese-evaluation-pane-shell"
        ref={shellRef}
      >
        <EvaluationPaneHeader headerAccessory={headerAccessory} />
        <EvaluationPaneContent
          activeStrategy={activeStrategy}
          activeStrategyId={activeStrategyId}
          nodes={nodes}
          onRequestFit={onRequestFit}
          setActiveStrategyId={setActiveStrategyId}
          setStrategyConfigs={setStrategyConfigs}
          strategyConfigs={strategyConfigs}
        />
      </div>
    </div>
  );
}
