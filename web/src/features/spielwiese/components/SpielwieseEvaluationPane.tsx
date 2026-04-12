import { useState, type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseDashboardVM } from "../types/dashboard";

type EvaluationStrategyId =
  | "llm-judge"
  | "cost"
  | "latency"
  | "response-length"
  | "javascript"
  | "text-matcher";

const evaluationStrategies: Array<{
  description: string;
  id: EvaluationStrategyId;
  label: string;
}> = [
  {
    id: "llm-judge",
    label: "LLM as a Judge",
    description: "Evaluate using other models",
  },
  {
    id: "cost",
    label: "Cost",
    description: "Cost of the response",
  },
  {
    id: "latency",
    label: "Latency",
    description: "Time to get a full response",
  },
  {
    id: "response-length",
    label: "Response Length",
    description: "Word, character, or token count",
  },
  {
    id: "javascript",
    label: "JavaScript",
    description: "Write a JavaScript code",
  },
  {
    id: "text-matcher",
    label: "Text Matcher",
    description: "Match text with various operators",
  },
];

function EvaluationStrategyButton({
  isActive,
  onClick,
  strategy,
}: {
  isActive: boolean;
  onClick: () => void;
  strategy: (typeof evaluationStrategies)[number];
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

function EvaluationStrategyDetail({
  nodesCount,
  strategy,
}: {
  nodesCount: number;
  strategy: (typeof evaluationStrategies)[number];
}) {
  return (
    <div
      className="border-border/40 flex flex-col gap-2 rounded-[12px] border bg-[#FBFBFB] px-3 py-3"
      data-testid="spielwiese-evaluation-strategy-detail"
    >
      <div className="flex items-center gap-2">
        <p className="text-foreground text-sm font-medium">{strategy.label}</p>
        <span className="text-foreground/54 rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-medium tracking-[0.04em] uppercase">
          {nodesCount} steps
        </span>
      </div>
      <p className="text-foreground/58 text-[12px] leading-5">
        {strategy.description}
      </p>
    </div>
  );
}

export function SpielwieseEvaluationPane({
  headerAccessory,
  nodes,
}: {
  headerAccessory?: ReactNode;
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
}) {
  const [activeStrategyId, setActiveStrategyId] =
    useState<EvaluationStrategyId>("llm-judge");
  const activeStrategy =
    evaluationStrategies.find((strategy) => strategy.id === activeStrategyId) ??
    evaluationStrategies[0];

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F3F3F4] px-2 pt-0 pb-2"
      data-testid="spielwiese-evaluation-pane"
    >
      <div
        className="bg-background flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-[8px] px-4 py-0 shadow-xs"
        data-testid="spielwiese-evaluation-pane-shell"
      >
        <div
          className="sticky top-0 z-10 -mx-4 flex w-[calc(100%+2rem)] items-start gap-3 border-b border-black/5 bg-[rgba(251,251,251,0.82)] px-4 pt-3 pb-3 supports-[backdrop-filter]:bg-[rgba(251,251,251,0.72)] supports-[backdrop-filter]:backdrop-blur-md"
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
        <div
          className="flex flex-col gap-3 pt-3 pb-3"
          data-testid="spielwiese-evaluation-content"
        >
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            data-testid="spielwiese-evaluation-strategy-list"
          >
            {evaluationStrategies.map((strategy) => (
              <EvaluationStrategyButton
                isActive={strategy.id === activeStrategy.id}
                key={strategy.id}
                strategy={strategy}
                onClick={() => setActiveStrategyId(strategy.id)}
              />
            ))}
          </div>
          <EvaluationStrategyDetail
            nodesCount={nodes.length}
            strategy={activeStrategy}
          />
        </div>
      </div>
    </div>
  );
}
