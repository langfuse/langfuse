import Link from "next/link";
import { Bot } from "@langfuse/icons";
import { type AgentScope, type AgentSummary } from "@langfuse/shared/agents";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { agentCost, agentNumber, agentProfilePath } from "../hooks/agentsQuery";

export function AgentGalleryCard({
  agent,
  scope,
}: {
  agent: AgentSummary;
  scope: AgentScope;
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
          <p
            className="text-muted-foreground mt-1 truncate text-xs"
            title={agent.identity.value}
          >
            {agent.identity.kind === "id" ? "ID" : "Name"}:{" "}
            {agent.identity.value}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">Runs</dt>
          <dd className="mt-0.5 font-bold tabular-nums">
            {agentNumber(stats.runs)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Traces</dt>
          <dd className="mt-0.5 font-bold tabular-nums">
            {agentNumber(stats.traces)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Model cost</dt>
          <dd className="mt-0.5 font-bold tabular-nums">
            {agentCost(stats.cost)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Tokens</dt>
          <dd className="mt-0.5 font-bold tabular-nums">
            {agentNumber(stats.totalTokens)}
          </dd>
        </div>
      </dl>
      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span>
          {stats.pricedModelCalls}/{stats.modelCalls} model calls priced
        </span>
        <span>
          {stats.usageKnownCalls}/{stats.modelCalls} with usage
        </span>
      </div>
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
          Last seen {agent.lastSeen.toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}
