import { useMemo } from "react";
import { type AgentOverviewResult } from "@langfuse/shared/agents";
import {
  prepareAgentOverview,
  type AgentOverviewSync,
} from "../lib/agentOverview";
import { agentCost, agentNumber } from "../hooks/agentsQuery";
import { AgentOverviewChart } from "./AgentOverviewChart";
import { AgentResourceTrends } from "./AgentResourceTrends";

export function AgentOverviewMetrics({
  result,
  sync,
}: {
  result: AgentOverviewResult;
  sync: AgentOverviewSync;
}) {
  const prepared = useMemo(() => prepareAgentOverview(result), [result]);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        Compared with {result.previous.from.toLocaleDateString()}–
        {result.previous.to.toLocaleDateString()}, the preceding period of equal
        length. Dotted lines align that period to this timeline.
      </p>
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        {prepared.charts.map((chart, index) => (
          <div
            key={chart.title}
            className={index === 0 ? "xl:col-span-2" : undefined}
          >
            <AgentOverviewChart chart={chart} sync={sync} />
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Model spend: {agentCost(result.current.stats.cost)} ·{" "}
        {agentNumber(result.current.stats.completedRuns)} completed runs ·{" "}
        {agentNumber(result.current.stats.unfinishedRuns)} unfinished runs. Cost
        per run uses {agentNumber(result.current.stats.runCostKnownRuns)} fully
        priced runs.
      </p>
      <AgentOverviewChart chart={prepared.resources} sync={sync} />
      <AgentResourceTrends result={result} />
    </div>
  );
}
