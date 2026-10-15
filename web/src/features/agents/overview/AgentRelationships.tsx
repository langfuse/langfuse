import { useId } from "react";
import Link from "next/link";
import {
  type AgentProjectionRelationship,
  type AgentSessionProjection,
} from "@langfuse/shared";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { AgentIdentity, useAgentAppearance } from "../appearance";
import {
  agentPath,
  type OverviewAgent,
  type OverviewScope,
} from "./prepareOverview";
import {
  prepareRelationships,
  relationshipLayout,
  RELATIONSHIP_LABELS,
  type RelationshipMode,
} from "./prepareRelationships";

function MapNode({
  name,
  scope,
  x,
  y,
  weight,
}: {
  name: string;
  scope: OverviewScope;
  x: number;
  y: number;
  weight: number;
}) {
  const appearance = useAgentAppearance(scope.projectId, name);
  return (
    <foreignObject x={x - 85} y={y - 26} width={170} height={58}>
      <Link
        href={agentPath(scope, name, { tab: "map" })}
        className="ph-no-capture bg-card hover:bg-accent focus-visible:outline-ring flex h-13 flex-col justify-center gap-1 rounded-lg border px-3 py-2 shadow-sm focus-visible:outline-2"
        style={{ borderColor: `${appearance.color}99` }}
      >
        <AgentIdentity projectId={scope.projectId} agentName={name} size="sm" />
        <span className="text-muted-foreground text-[10px]">
          {weight ? `${weight} connections` : "No loaded connections"}
        </span>
      </Link>
    </foreignObject>
  );
}
function EdgeEvidence({
  edge,
  scope,
  mode,
}: {
  edge: AgentProjectionRelationship;
  scope: OverviewScope;
  mode: RelationshipMode;
}) {
  const unit =
    mode === "calls"
      ? "calls"
      : mode === "available-tools"
        ? "shared available tools"
        : mode === "tools"
          ? "shared executed tools"
          : `shared ${mode}`;
  return (
    <li className="ph-no-capture flex flex-col gap-1 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Link
          href={agentPath(scope, edge.source)}
          className="max-w-60 truncate hover:underline"
        >
          <AgentIdentity
            projectId={scope.projectId}
            agentName={edge.source}
            size="sm"
          />
        </Link>
        <span className="text-muted-foreground">
          {mode === "calls" ? "→" : "↔"}
        </span>
        <Link
          href={agentPath(scope, edge.target)}
          className="max-w-60 truncate hover:underline"
        >
          <AgentIdentity
            projectId={scope.projectId}
            agentName={edge.target}
            size="sm"
          />
        </Link>
        <span className="text-muted-foreground ml-auto">
          {edge.weight} {unit}
        </span>
      </div>
      <p className="text-muted-foreground text-[11px] break-words">
        {mode === "available-tools"
          ? "Explicit tool availability"
          : edge.provenance === "trace-ancestry"
            ? "Trace ancestry"
            : edge.provenance === "declared-session-link"
              ? "Declared session link"
              : edge.provenance === "observed-tools"
                ? "Observed executions"
                : "Declared metadata"}
        {edge.evidence.length
          ? ` · ${edge.evidence.slice(0, 8).join(" · ")}${edge.evidence.length > 8 ? ` · +${edge.evidence.length - 8} more` : ""}`
          : ""}
      </p>
    </li>
  );
}
export function AgentRelationships({
  agents,
  scope,
  projection,
  mode,
  onModeChange,
}: {
  agents: OverviewAgent[];
  scope: OverviewScope;
  projection: AgentSessionProjection;
  mode: RelationshipMode;
  onModeChange: (mode: RelationshipMode) => void;
}) {
  const markerId = useId().replaceAll(":", ""),
    names = agents.map((agent) => agent.agentName),
    edges = prepareRelationships(projection, mode, names),
    layout = relationshipLayout(names),
    byName = new Map(layout.nodes.map((node) => [node.name, node]));
  const connections = new Map<string, number>();
  for (const edge of edges) {
    connections.set(edge.source, (connections.get(edge.source) ?? 0) + 1);
    if (edge.source !== edge.target)
      connections.set(edge.target, (connections.get(edge.target) ?? 0) + 1);
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">Agent relationships</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {mode === "calls"
              ? "Directed call evidence, with provenance shown for every connection."
              : mode === "available-tools"
                ? "Shared tool definitions declared by agents, including tools not executed in this window."
                : mode === "tools"
                  ? "Overlap in tools actually executed in the selected window."
                  : `Overlap in explicitly declared ${mode}. These links do not imply calls.`}
          </p>
        </div>
        <div className="w-56">
          <SelectInput
            placeholder="Relationship evidence"
            aria-label="Relationship evidence"
            value={mode}
            onValueChange={onModeChange}
            options={Object.entries(RELATIONSHIP_LABELS).map(
              ([value, label]) => ({ value: value as RelationshipMode, label }),
            )}
          />
        </div>
      </div>
      <div className="ph-no-capture bg-muted/10 max-h-[38rem] overflow-auto rounded-lg border">
        <svg
          width={layout.width}
          height={layout.height}
          role="img"
          aria-label={`${RELATIONSHIP_LABELS[mode]} relationship map; accessible connections follow below`}
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                fill="currentColor"
                className="text-muted-foreground"
              />
            </marker>
          </defs>
          <g className="text-muted-foreground" fill="none">
            {edges.map((edge, i) => {
              const source = byName.get(edge.source),
                target = byName.get(edge.target);
              if (!source || !target) return null;
              const same = source.name === target.name;
              const dx = target.x - source.x,
                dy = target.y - source.y,
                distance = Math.hypot(dx, dy);
              const trim =
                distance > 0 ? Math.min(90, distance / 3) / distance : 0;
              const path = same
                ? `M ${source.x - 15} ${source.y - 27} C ${source.x - 90} ${source.y - 100}, ${source.x + 90} ${source.y - 100}, ${source.x + 15} ${source.y - 27}`
                : `M ${source.x + dx * trim} ${source.y + dy * trim} L ${target.x - dx * trim} ${target.y - dy * trim}`;
              return (
                <g
                  key={JSON.stringify([
                    edge.source,
                    edge.target,
                    edge.provenance,
                    i,
                  ])}
                >
                  <path
                    d={path}
                    stroke="currentColor"
                    strokeWidth={Math.min(6, 1 + Math.log2(1 + edge.weight))}
                    strokeOpacity={0.4}
                    strokeDasharray={mode === "calls" ? undefined : "5 5"}
                    markerEnd={
                      mode === "calls" ? `url(#${markerId})` : undefined
                    }
                  >
                    <title>
                      {edge.source}{" "}
                      {mode === "calls" ? "calls" : "shares evidence with"}{" "}
                      {edge.target}: {edge.weight}; {edge.provenance}
                    </title>
                  </path>
                  <text
                    x={same ? source.x : (source.x + target.x) / 2}
                    y={same ? source.y - 70 : (source.y + target.y) / 2 - 6}
                    textAnchor="middle"
                    fill="currentColor"
                    className="text-[10px]"
                  >
                    {edge.weight}
                  </text>
                </g>
              );
            })}
          </g>
          {layout.nodes.map((node) => (
            <MapNode
              key={node.name}
              {...node}
              scope={scope}
              weight={connections.get(node.name) ?? 0}
            />
          ))}
        </svg>
      </div>
      {edges.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {mode === "calls"
            ? "No named-agent call evidence in this window. Isolated agents remain visible."
            : `No ${RELATIONSHIP_LABELS[mode].toLowerCase()} in the loaded evidence. Select another mode or widen the window.`}
        </div>
      ) : (
        <details className="rounded-lg border p-3" open={edges.length < 5}>
          <summary className="cursor-pointer text-xs font-bold">
            Connections · {edges.length} · inspect evidence
          </summary>
          <ul className="mt-3 grid max-h-80 gap-2 overflow-y-auto lg:grid-cols-2">
            {edges.map((edge, i) => (
              <EdgeEvidence key={i} edge={edge} scope={scope} mode={mode} />
            ))}
          </ul>
        </details>
      )}
      <p className="text-muted-foreground text-xs">
        {mode === "calls"
          ? "Weights count observed call evidence in the bounded sample. Trace ancestry and declared session links are distinguished in the connection list. Repeated calls within one agent remain self-loops."
          : "Weights count shared names or explicit labels, not semantic similarity. Connections are undirected and do not establish execution order."}{" "}
        Pan using the scroll area. Open a node for its detailed call map.
      </p>
    </section>
  );
}
