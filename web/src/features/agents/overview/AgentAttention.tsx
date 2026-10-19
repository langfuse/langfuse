import Link from "next/link";
import { CircleAlert, TrendingUp } from "lucide-react";
import { type AgentSessionProjection } from "@langfuse/shared";
import { AgentIdentity } from "../appearance";
import { agentPath, type OverviewScope } from "./prepareOverview";
export function AgentAttention({
  projection,
  scope,
}: {
  projection: AgentSessionProjection;
  scope: OverviewScope;
}) {
  const signals = projection.agents.flatMap((agent) =>
    agent.signals.map((signal) => ({ agent, signal })),
  );
  const costly = [...projection.agents]
    .filter((agent) => agent.current.cost > 0)
    .sort((a, b) => b.current.cost - a.current.cost)
    .slice(0, 3);
  return (
    <section
      className="grid gap-3 lg:grid-cols-2"
      aria-label="Changes and rankings"
    >
      <div className="bg-card rounded-lg border p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <CircleAlert className="icon-base text-amber-500" />
          Worth a closer look
        </h2>
        {signals.length ? (
          <ul className="ph-no-capture mt-3 flex max-h-44 flex-col gap-2 overflow-y-auto">
            {signals.slice(0, 8).map(({ agent, signal }) => (
              <li key={`${agent.agentName}:${signal.kind}`}>
                <Link
                  href={agentPath(scope, agent.agentName, {
                    tab: "sessions",
                    agentSignal: signal.kind,
                  })}
                  className="group hover:bg-muted flex items-start justify-between gap-3 rounded-md p-2"
                >
                  <div className="min-w-0">
                    <AgentIdentity
                      projectId={scope.projectId}
                      agentName={agent.agentName}
                      size="sm"
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      {signal.message}
                    </p>
                  </div>
                  <span className="text-muted-foreground group-hover:text-foreground shrink-0 text-xs">
                    Inspect →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-3 text-xs">
            {projection.agents.some(
              (agent) => agent.comparisonStatus !== "ready",
            )
              ? "No suggestions yet. Comparisons require complete cohorts with at least 20 baseline and 5 recent sessions."
              : "No configured change or outlier threshold was triggered in these cohorts."}
          </p>
        )}
        <p className="text-muted-foreground mt-3 text-[11px]">
          Suggestions use prototype thresholds. Absence of a signal does not
          establish correctness.
        </p>
      </div>
      <div className="bg-card rounded-lg border p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <TrendingUp className="icon-base text-muted-foreground" />
          Highest cost in loaded agents
        </h2>
        {costly.length ? (
          <ol className="ph-no-capture mt-3 flex flex-col gap-3">
            {costly.map((agent, i) => (
              <li key={agent.agentName}>
                <Link
                  href={agentPath(scope, agent.agentName, { tab: "sessions" })}
                  className="flex items-center justify-between gap-3 hover:underline"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="text-muted-foreground text-xs">
                      {i + 1}
                    </span>
                    <AgentIdentity
                      projectId={scope.projectId}
                      agentName={agent.agentName}
                      size="sm"
                    />
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    ${agent.current.cost.toFixed(4)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground mt-3 text-xs">
            No attributed cost in this window.
          </p>
        )}
        <p className="text-muted-foreground mt-3 text-[11px]">
          Window totals from the loaded discovery sample. Cost excludes
          observations attributed to other agents.
        </p>
      </div>
    </section>
  );
}
