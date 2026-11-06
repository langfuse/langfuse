import Link from "next/link";
import { Bot } from "@langfuse/icons";
import { type AgentScope, type AgentSummary } from "@langfuse/shared/agents";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import {
  agentCost,
  agentDuration,
  agentNumber,
  agentProfilePath,
} from "../hooks/agentsQuery";
import { type AgentActivityState } from "../lib/agentActivity";
import { AgentActivitySparkline } from "./AgentActivitySparkline";
import { AgentRecentActivity } from "./AgentRecentActivity";
import { agentPeriodChange } from "../lib/agentOverview";

export function AgentGalleryCard({
  agent,
  scope,
  activity,
  now,
}: {
  agent: AgentSummary;
  scope: AgentScope;
  activity: AgentActivityState;
  now: number;
}) {
  const stats = agent.stats;
  return (
    <Link
      href={agentProfilePath(scope, agent.identity)}
      className="ph-no-capture bg-card hover:bg-muted/40 focus-visible:ring-ring flex min-w-0 flex-col gap-4 rounded-lg border p-4 focus-visible:ring-2 focus-visible:outline-hidden"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Bot size="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold" title={agent.displayName}>
            {agent.displayName}
          </h2>
        </div>
        <AgentRecentActivity lastSeen={agent.lastSeen} now={now} />
      </div>
      <AgentActivitySparkline activity={activity} />
      {agent.comparison && (
        <p className="text-muted-foreground text-xs">
          {stats.observations === 0
            ? "No activity in the selected period"
            : `${agentPeriodChange(stats.runs, agent.comparison.stats.runs)} for agent runs`}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">Agent runs</dt>
          <dd className="mt-0.5 font-bold tabular-nums">
            {agentNumber(stats.runs)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">
            <CustomTooltip
              content={
                <p className="ph-no-capture max-w-xs">
                  Mean model cost owned by completed agent runs, excluding
                  sub-agent costs.{" "}
                  {stats.runCostKnownRuns === undefined
                    ? "Coverage was not recorded."
                    : `${stats.runCostKnownRuns.toLocaleString()} of ${(stats.completedRuns ?? 0).toLocaleString()} completed runs have owned model calls with all observed calls priced.`}
                </p>
              }
            >
              {({ getTriggerProps }) => (
                <span {...getTriggerProps()}>Cost / agent run</span>
              )}
            </CustomTooltip>
          </dt>
          <dd className="mt-0.5 font-bold tabular-nums">
            {agentCost(stats.averageRunCost ?? null)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Average duration</dt>
          <dd className="mt-0.5 font-bold tabular-nums">
            {agentDuration(stats.averageRunDurationMs)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Error-level runs</dt>
          <dd className="mt-0.5 font-bold tabular-nums">
            {stats.runs > 0
              ? `${((stats.errorRuns / stats.runs) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
              : "—"}
          </dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-xs">
        Model spend {agentCost(stats.cost)}
      </p>
      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-1.5">
        {agent.environments.slice(0, 2).map((environment) => (
          <Badge
            key={environment}
            text={environment || "Empty environment"}
            color="filled"
          />
        ))}
        {agent.environments.length > 2 && (
          <span className="text-muted-foreground text-xs">
            +{agent.environments.length - 2}
          </span>
        )}
        <span
          className="text-muted-foreground ml-auto text-xs"
          title={agent.lastSeen.toISOString()}
        >
          Last seen{" "}
          {agent.lastSeen.getTime() > now
            ? agent.lastSeen.toLocaleString()
            : formatCompactRelativeTime(agent.lastSeen)}
        </span>
      </div>
    </Link>
  );
}
