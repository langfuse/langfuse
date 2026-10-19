import {
  type AgentSessionProjection,
  type AgentProjectionRelationship,
} from "@langfuse/shared";
import { type AgentsPrototypeOptions } from "../prototype-options/options";
export type RelationshipMode = AgentsPrototypeOptions["relationshipView"];
export const RELATIONSHIP_LABELS: Record<RelationshipMode, string> = {
  calls: "Observed calls",
  tools: "Shared executed tools",
  "available-tools": "Shared available tools",
  tasks: "Shared tasks",
  areas: "Shared areas",
  topics: "Shared topics",
};
export function prepareRelationships(
  projection: AgentSessionProjection,
  mode: RelationshipMode,
  names: string[],
): AgentProjectionRelationship[] {
  const visible = new Set(names);
  if (mode !== "available-tools")
    return projection.relationships.filter(
      (edge) =>
        edge.kind === mode &&
        visible.has(edge.source) &&
        visible.has(edge.target),
    );
  const available = new Map<string, Set<string>>();
  for (const tool of projection.tools) {
    if (!tool.available || !visible.has(tool.agentName)) continue;
    const tools = available.get(tool.agentName) ?? new Set<string>();
    tools.add(tool.name);
    available.set(tool.agentName, tools);
  }
  const edges: AgentProjectionRelationship[] = [],
    sorted = [...visible].sort();
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      const evidence = [...(available.get(sorted[i]) ?? [])]
        .filter((name) => available.get(sorted[j])?.has(name))
        .sort();
      if (evidence.length > 0)
        edges.push({
          source: sorted[i],
          target: sorted[j],
          kind: "tools",
          weight: evidence.length,
          evidence,
          provenance: "declared-label",
        });
    }
  return edges;
}
export function relationshipLayout(names: string[]) {
  const sorted = [...new Set(names)].sort(),
    width = Math.max(920, sorted.length * 70),
    height = Math.max(480, sorted.length * 30);
  return {
    width,
    height,
    nodes: sorted.map((name, i) => {
      const angle =
        -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, sorted.length);
      return {
        name,
        x:
          width / 2 +
          (sorted.length === 1 ? 0 : width / 2 - 115) * Math.cos(angle),
        y:
          height / 2 +
          (sorted.length === 1 ? 0 : height / 2 - 55) * Math.sin(angle),
      };
    }),
  };
}
