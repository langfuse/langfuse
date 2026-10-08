import { type AgentMapSkeletonRow } from "@langfuse/shared";
import { type GraphCanvasData } from "@/src/features/trace-graph-view/types";

type AgentMapNode = GraphCanvasData["nodes"][number] & {
  agentName: string | null;
  kind: "agent" | "root" | "unknown" | "unnamed";
};

type AgentMapEdge = GraphCanvasData["edges"][number] & {
  count: number;
  traceCount: number;
  traceIds: string[];
};

export type AgentMapData = {
  nodes: (AgentMapNode & { selfCallCount: number })[];
  edges: AgentMapEdge[];
  diagnostics: {
    duplicateRows: number;
    missingParentRuns: number;
    cyclicParentRuns: number;
    unnamedAgentRuns: number;
    selfCallRuns: number;
    selfCallTraces: number;
  };
};

const ROOT_ID = "boundary:root";
const UNKNOWN_ID = "boundary:unknown";
const UNNAMED_ID = "boundary:unnamed";
const agentNodeId = (agentName: string) => `agent:${agentName}`;
const observationKey = (traceId: string, spanId: string) =>
  JSON.stringify([traceId, spanId]);
const edgeKey = (from: string, to: string) => JSON.stringify([from, to]);

function nodeForAgent(agentName: string | null): AgentMapNode {
  return agentName
    ? {
        id: agentNodeId(agentName),
        label: agentName,
        type: "AGENT",
        agentName,
        kind: "agent",
      }
    : {
        id: UNNAMED_ID,
        label: "Unnamed agent",
        type: "AGENT",
        agentName: null,
        kind: "unnamed",
      };
}

/**
 * Observation identity is trace-scoped. Only an explicitly null parent proves
 * a root; a missing row or a malformed parent cycle leaves the caller unknown.
 */
export function buildAgentMapData(
  rows: readonly AgentMapSkeletonRow[],
  currentAgentName: string,
  showAllAgents: boolean,
): AgentMapData {
  const byId = new Map<string, AgentMapSkeletonRow>();
  let duplicateRows = 0;
  for (const row of rows) {
    const key = observationKey(row.traceId, row.spanId);
    const previous = byId.get(key);
    if (previous) duplicateRows++;
    if (!previous || row.startTime.getTime() >= previous.startTime.getTime()) {
      byId.set(key, row);
    }
  }

  // Cache complete ancestry classification so a deep, shared chain is walked
  // once, and an AGENT boundary cannot conceal corrupt cyclic parentage.
  const ancestry = new Map<string, "root" | "missing" | "cycle">();
  for (const startKey of byId.keys()) {
    if (ancestry.has(startKey)) continue;
    const path: string[] = [];
    const visiting = new Set<string>();
    let key = startKey;
    let status: "root" | "missing" | "cycle";
    while (true) {
      const known = ancestry.get(key);
      if (known) {
        status = known;
        break;
      }
      if (visiting.has(key)) {
        status = "cycle";
        break;
      }
      const row = byId.get(key);
      if (!row) {
        status = "missing";
        break;
      }
      visiting.add(key);
      path.push(key);
      if (row.parentSpanId === null) {
        status = "root";
        break;
      }
      key = observationKey(row.traceId, row.parentSpanId);
    }
    for (const visited of path) ancestry.set(visited, status);
  }

  type Caller = { node: AgentMapNode; missing: boolean };
  const nearestAgent = new Map<string, Caller>();
  const root: AgentMapNode = {
    id: ROOT_ID,
    label: "(root)",
    type: "SPAN",
    agentName: null,
    kind: "root",
  };
  const unknown: AgentMapNode = {
    id: UNKNOWN_ID,
    label: "Unknown caller",
    type: "SPAN",
    agentName: null,
    kind: "unknown",
  };
  const callerFor = (row: AgentMapSkeletonRow): Caller => {
    if (row.parentSpanId === null) return { node: root, missing: false };
    const path: string[] = [];
    let key = observationKey(row.traceId, row.parentSpanId);
    let caller: Caller;
    while (true) {
      const cached = nearestAgent.get(key);
      if (cached) {
        caller = cached;
        break;
      }
      const parent = byId.get(key);
      if (!parent) {
        caller = { node: unknown, missing: true };
        break;
      }
      if (parent.type === "AGENT") {
        caller = { node: nodeForAgent(parent.agentName), missing: false };
        break;
      }
      path.push(key);
      if (parent.parentSpanId === null) {
        caller = { node: root, missing: false };
        break;
      }
      key = observationKey(parent.traceId, parent.parentSpanId);
    }
    for (const visited of path) nearestAgent.set(visited, caller);
    return caller;
  };

  const nodes = new Map<string, AgentMapNode>();
  const edges = new Map<
    string,
    { from: string; to: string; count: number; traces: Set<string> }
  >();
  const diagnostics = {
    duplicateRows,
    missingParentRuns: 0,
    cyclicParentRuns: 0,
    unnamedAgentRuns: 0,
    selfCallRuns: 0,
    selfCallTraces: 0,
  };
  for (const [key, row] of byId) {
    if (row.type !== "AGENT") continue;
    const callee = nodeForAgent(row.agentName);
    const isCycle = ancestry.get(key) === "cycle";
    const caller = isCycle ? { node: unknown, missing: false } : callerFor(row);
    if (isCycle) diagnostics.cyclicParentRuns++;
    if (caller.missing) diagnostics.missingParentRuns++;
    if (!row.agentName) diagnostics.unnamedAgentRuns++;
    if (
      !showAllAgents &&
      caller.node.agentName !== currentAgentName &&
      callee.agentName !== currentAgentName
    )
      continue;
    nodes.set(caller.node.id, caller.node);
    nodes.set(callee.id, callee);
    const connection = edgeKey(caller.node.id, callee.id);
    const existing = edges.get(connection);
    if (existing) {
      existing.count++;
      existing.traces.add(row.traceId);
    } else {
      edges.set(connection, {
        from: caller.node.id,
        to: callee.id,
        count: 1,
        traces: new Set([row.traceId]),
      });
    }
  }

  const selfCallCounts = new Map<string, number>();
  const selfCallTraceIds = new Set<string>();
  for (const edge of edges.values()) {
    // Unnamed observations sharing a boundary do not prove agent identity.
    if (edge.from !== edge.to || nodes.get(edge.from)?.kind !== "agent")
      continue;
    selfCallCounts.set(edge.from, edge.count);
    diagnostics.selfCallRuns += edge.count;
    for (const traceId of edge.traces) selfCallTraceIds.add(traceId);
  }
  diagnostics.selfCallTraces = selfCallTraceIds.size;

  return {
    nodes: [...nodes.values()]
      .map((node) => ({
        ...node,
        selfCallCount: selfCallCounts.get(node.id) ?? 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    edges: [...edges.values()]
      .map(({ traces, ...edge }) => ({
        ...edge,
        traceCount: traces.size,
        traceIds: [...traces].sort(),
        weight: 1 + Math.log2(edge.count),
        label: `×${edge.count}`,
      }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          edgeKey(a.from, a.to).localeCompare(edgeKey(b.from, b.to)),
      ),
    diagnostics,
  };
}
