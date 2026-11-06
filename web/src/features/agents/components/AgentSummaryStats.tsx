import { type AgentStats } from "@langfuse/shared/agents";
import { agentCost, agentDuration, agentNumber } from "../hooks/agentsQuery";

export function AgentSummaryStats({ stats }: { stats: AgentStats }) {
  const items = [
    ["Invocations", agentNumber(stats.runs)],
    ["Traces", agentNumber(stats.traces)],
    ["Model cost", agentCost(stats.cost)],
    ["Tokens", agentNumber(stats.totalTokens)],
    ["Average invocation duration", agentDuration(stats.averageRunDurationMs)],
    ["Error-level invocations", agentNumber(stats.errorRuns)],
  ];
  return (
    <div className="shrink-0 px-4 pb-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <details className="text-muted-foreground mt-4 text-xs">
        <summary className="w-fit cursor-pointer">
          Model metric coverage
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>
            Cost and tokens use this agent’s attributed model calls in the
            selected period. Priced: {stats.pricedModelCalls}/{stats.modelCalls}
            . Usage known: {stats.usageKnownCalls}/{stats.modelCalls}.
          </p>
          {stats.unattributedModelCalls > 0 && (
            <p>
              {agentNumber(stats.unattributedModelCalls)} model calls identify
              this agent without a verified owning invocation. These calls are
              included in the totals.
            </p>
          )}
          {stats.traceUnassignedModelCalls > 0 && (
            <p>
              {agentNumber(stats.traceUnassignedModelCalls)} model calls in
              these traces have no agent attribution. They may belong to another
              agent and are excluded, so this agent’s totals may be incomplete.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
