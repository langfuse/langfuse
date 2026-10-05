/** Why the Graph view is or is not available for a trace. */

import { type AgentGraphDataResponse } from "@/src/features/trace-graph-view";

export const MAX_NODES_FOR_GRAPH_UI = 5000;

export type GraphUnavailableReason = "no-data" | "too-large" | "no-structure";

export type GraphAvailability =
  | { available: true; isAgentGraph: boolean }
  | { available: false; reason: GraphUnavailableReason };

export function resolveGraphAvailability(
  agentGraphData: AgentGraphDataResponse[],
): GraphAvailability {
  if (agentGraphData.length === 0) {
    return { available: false, reason: "no-data" };
  }
  if (agentGraphData.length >= MAX_NODES_FOR_GRAPH_UI) {
    return { available: false, reason: "too-large" };
  }

  // "Real" agent graph: agentic observation types or LangGraph step metadata.
  const hasGraphableObservations = agentGraphData.some(
    (obs) =>
      obs.observationType !== "SPAN" &&
      obs.observationType !== "EVENT" &&
      obs.observationType !== "GENERATION",
  );
  const hasLangGraphData = agentGraphData.some(
    (obs) => obs.step != null && obs.step !== 0,
  );
  if (hasGraphableObservations || hasLangGraphData) {
    return { available: true, isAgentGraph: true };
  }

  // Otherwise the graph only earns its place with structure beyond the tree.
  // A single parentless root does not count: v4 mirrors every trace as one.
  const nonEvent = agentGraphData.filter(
    (obs) => obs.observationType !== "EVENT",
  );
  const parentless = nonEvent.filter((obs) => !obs.parentObservationId);
  const counted =
    parentless.length === 1
      ? nonEvent.filter((obs) => obs.parentObservationId)
      : nonEvent;
  const distinctNodes = new Set(counted.map((obs) => obs.name));
  return distinctNodes.size > 1
    ? { available: true, isAgentGraph: false }
    : { available: false, reason: "no-structure" };
}
