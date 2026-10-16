import Link from "next/link";
import { ArrowUpRight, CircleAlert, Moon } from "lucide-react";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import {
  AgentIdentity,
  AgentAppearancePicker,
  useAgentAppearance,
} from "../appearance";
import { AgentComparisonSparkline } from "./AgentComparisonSparkline";
import { AgentPreview } from "./AgentPreview";
import {
  agentPath,
  formatMetric,
  METRIC_LABELS,
  metricValue,
  type OverviewAgent,
  type AgentOverviewListProps,
} from "./prepareOverview";

function AgentCard({
  agent,
  scope,
  metrics,
  projection,
  showAttention = true,
}: AgentOverviewListProps & { agent: OverviewAgent }) {
  const appearance = useAgentAppearance(scope.projectId, agent.agentName);
  return (
    <article className="ph-no-capture bg-card flex min-w-0 flex-col overflow-hidden rounded-xl border shadow-xs transition-shadow hover:shadow-md">
      <div
        className="flex items-start justify-between gap-3 border-b p-4"
        style={{
          background: `linear-gradient(120deg, ${appearance.color}18, transparent)`,
        }}
      >
        <div className="min-w-0 flex-1">
          <HoverCard
            content={
              <AgentPreview
                agent={agent}
                scope={scope}
                projection={projection}
              />
            }
            placement="right-start"
          >
            {({ getTriggerProps }) => (
              <Link
                {...getTriggerProps()}
                href={agentPath(scope, agent.agentName)}
                className="group flex min-w-0 items-center gap-2 font-bold"
              >
                <AgentIdentity
                  projectId={scope.projectId}
                  agentName={agent.agentName}
                />
                <ArrowUpRight className="icon-base text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
              </Link>
            )}
          </HoverCard>
          <div className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
            {agent.state === "dormant" ? (
              <>
                <Moon className="icon-base" />
                No activity in window
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Observed in window
              </>
            )}
          </div>
        </div>
        <AgentAppearancePicker
          projectId={scope.projectId}
          agentName={agent.agentName}
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-4">
        {metrics.map((metric) => (
          <div key={metric}>
            <dt className="text-muted-foreground text-xs">
              {METRIC_LABELS[metric]}
            </dt>
            <dd className="mt-1 text-xl font-bold tabular-nums">
              {formatMetric(metric, metricValue(agent, metric))}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto px-4 pb-3">
        <AgentComparisonSparkline
          agent={agent}
          projection={projection}
          color={appearance.color}
        />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-2 border-t px-4 py-2 text-xs">
        {showAttention && agent.signals.length > 0 ? (
          <Link
            href={agentPath(scope, agent.agentName, {
              tab: "sessions",
              agentSignal: agent.signals[0].kind,
            })}
            className="flex items-center gap-1.5 text-amber-600 hover:underline dark:text-amber-400"
          >
            <CircleAlert className="icon-base" />
            {agent.signals.length} change{agent.signals.length === 1 ? "" : "s"}{" "}
            to inspect
          </Link>
        ) : (
          <span className="text-muted-foreground">
            {agent.comparisonStatus === "ready"
              ? "No configured signal triggered"
              : "More complete sessions needed"}
          </span>
        )}
        <Link
          className="text-muted-foreground hover:text-foreground shrink-0"
          href={agentPath(scope, agent.agentName, { tab: "sessions" })}
        >
          Sessions →
        </Link>
      </div>
    </article>
  );
}
export function AgentOverviewCards(props: AgentOverviewListProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {props.agents.map((agent) => (
        <AgentCard key={agent.agentName} {...props} agent={agent} />
      ))}
    </div>
  );
}
