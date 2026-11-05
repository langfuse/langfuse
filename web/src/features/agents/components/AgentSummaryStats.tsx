import { type AgentStats } from "@langfuse/shared/agents";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { agentCost, agentDuration, agentNumber } from "../hooks/agentsQuery";

export function AgentSummaryStats({ stats }: { stats: AgentStats }) {
  const items = [
    ["Runs", agentNumber(stats.runs)],
    ["Traces", agentNumber(stats.traces)],
    ["Model cost", agentCost(stats.cost)],
    ["Tokens", agentNumber(stats.totalTokens)],
    ["Average run duration", agentDuration(stats.averageRunDurationMs)],
    ["Error-level runs", agentNumber(stats.errorRuns)],
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
      <p className="text-muted-foreground mt-3 text-xs">
        Selected period · Model cost and tokens use attributed model calls.
        Priced: {stats.pricedModelCalls}/{stats.modelCalls}. Usage known:{" "}
        {stats.usageKnownCalls}/{stats.modelCalls}.{" "}
        {stats.unattributedModelCalls > 0 &&
          `Model calls without a verified owning run: ${agentNumber(stats.unattributedModelCalls)}. Included in these agent totals.`}
      </p>
      {stats.traceUnassignedModelCalls > 0 && (
        <div className="mt-3">
          <Alert variant="warning" size="sm">
            <Alert.Description>
              Model calls without agent attribution in these traces:{" "}
              {agentNumber(stats.traceUnassignedModelCalls)}. Totals may be
              incomplete. These calls may belong to another agent in the same
              traces.
            </Alert.Description>
          </Alert>
        </div>
      )}
    </div>
  );
}
