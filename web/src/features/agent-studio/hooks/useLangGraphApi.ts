import { useCallback } from "react";
import {
  type LangGraphAssistant,
  type LangGraphThread,
  type LangGraphGraphDef,
  type LangGraphGraphNode,
  type LangGraphGraphEdge,
} from "../types";

// Deduplicate nodes that appear multiple times (e.g. from Send() fan-out).
function deduplicateGraph(graph: LangGraphGraphDef): LangGraphGraphDef {
  const idToCanonical: Record<string, string> = {};
  const seenByKey = new Map<string, LangGraphGraphNode>();

  for (const node of graph.nodes) {
    const key = node.name ?? node.id.split(":")[0] ?? node.id;
    if (!seenByKey.has(key)) seenByKey.set(key, node);
    idToCanonical[node.id] = seenByKey.get(key)!.id;
  }

  const nodes = [...seenByKey.values()];
  const edgeKeys = new Set<string>();
  const edges = graph.edges
    .map((e) => ({
      ...e,
      source: idToCanonical[e.source] ?? e.source,
      target: idToCanonical[e.target] ?? e.target,
    }))
    .filter((e) => {
      if (e.source === e.target) return false;
      const k = `${e.source}||${e.target}`;
      if (edgeKeys.has(k)) return false;
      edgeKeys.add(k);
      return true;
    });

  return { nodes, edges };
}

// Newer LangGraph versions (≥0.3) return xray graphs as a flat expansion where
// subgraph inner nodes get prefixed ids: "parent_node:child_node".
// This reconstructs them into proper {type:"subgraph", data:{nodes,edges}} containers.
function reconstructSubgraphs(graph: LangGraphGraphDef): LangGraphGraphDef {
  // Identify inner nodes by the "parent:child" id pattern
  const innerNodeIds = new Set<string>();
  const innerByParent: Record<string, LangGraphGraphNode[]> = {};

  for (const node of graph.nodes) {
    const colonIdx = node.id.indexOf(":");
    if (colonIdx > 0) {
      const parentId = node.id.slice(0, colonIdx);
      const childId = node.id.slice(colonIdx + 1);
      if (!innerByParent[parentId]) innerByParent[parentId] = [];
      innerByParent[parentId].push({
        ...node,
        id: childId,
        name: node.name ?? childId,
      });
      innerNodeIds.add(node.id);
    }
  }

  if (Object.keys(innerByParent).length === 0) return deduplicateGraph(graph);

  // Split edges: inner-to-inner stay inside the subgraph; cross-boundary get remapped
  const innerEdgesByParent: Record<string, LangGraphGraphEdge[]> = {};
  const outerEdges: LangGraphGraphEdge[] = [];

  for (const edge of graph.edges) {
    const srcParent = edge.source.includes(":")
      ? edge.source.slice(0, edge.source.indexOf(":"))
      : null;
    const tgtParent = edge.target.includes(":")
      ? edge.target.slice(0, edge.target.indexOf(":"))
      : null;

    if (srcParent && tgtParent && srcParent === tgtParent) {
      // Both endpoints are inner nodes of the same subgraph → inner edge
      if (!innerEdgesByParent[srcParent]) innerEdgesByParent[srcParent] = [];
      innerEdgesByParent[srcParent].push({
        ...edge,
        source: edge.source.slice(edge.source.indexOf(":") + 1),
        target: edge.target.slice(edge.target.indexOf(":") + 1),
      });
    } else {
      // Cross-boundary: remap inner endpoints to their parent id
      outerEdges.push({
        ...edge,
        source: srcParent ?? edge.source,
        target: tgtParent ?? edge.target,
      });
    }
  }

  // Build synthetic subgraph nodes
  const outerNodes = graph.nodes.filter((n) => !innerNodeIds.has(n.id));
  const outerIds = new Set(outerNodes.map((n) => n.id));

  for (const [parentId, innerNodes] of Object.entries(innerByParent)) {
    const synthetic: LangGraphGraphNode = {
      id: parentId,
      name: parentId,
      type: "subgraph",
      data: {
        nodes: innerNodes,
        edges: innerEdgesByParent[parentId] ?? [],
      } as Record<string, unknown>,
    };
    if (outerIds.has(parentId)) {
      // Replace existing outer node
      const idx = outerNodes.findIndex((n) => n.id === parentId);
      if (idx >= 0) outerNodes[idx] = synthetic;
    } else {
      outerNodes.push(synthetic);
    }
  }

  // Deduplicate outer edges (remove self-loops and duplicates)
  const edgeKeys = new Set<string>();
  const uniqueEdges = outerEdges.filter((e) => {
    if (e.source === e.target) return false;
    const k = `${e.source}||${e.target}`;
    if (edgeKeys.has(k)) return false;
    edgeKeys.add(k);
    return true;
  });

  return { nodes: outerNodes, edges: uniqueEdges };
}

function buildProxyUrl(
  projectId: string,
  serverId: string,
  path: string,
): string {
  const sep = path.includes("?") ? "&" : "?";
  return `/api/project/${projectId}/langgraph/${path}${sep}serverId=${serverId}`;
}

export function useLangGraphApi(
  projectId: string,
  serverId: string | null,
  serverUrl?: string | null,
) {
  const proxyFetch = useCallback(
    async (path: string, options?: RequestInit): Promise<Response> => {
      if (!serverId) throw new Error("No server selected");

      // Custom headers are injected server-side by the proxy (decrypted from DB).
      return fetch(buildProxyUrl(projectId, serverId, path), options ?? {});
    },
    [projectId, serverId],
  );

  const listAssistants = useCallback(async (): Promise<
    LangGraphAssistant[]
  > => {
    const res = await proxyFetch("assistants/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 100 }),
    });
    if (!res.ok) throw new Error(`Failed to list assistants: ${res.status}`);
    const data = (await res.json()) as LangGraphAssistant[];
    return data;
  }, [proxyFetch]);

  const getSchema = useCallback(
    async (assistantId: string): Promise<Record<string, unknown>> => {
      const res = await proxyFetch(`assistants/${assistantId}/schemas`);
      if (!res.ok) throw new Error(`Failed to get schema: ${res.status}`);
      return res.json() as Promise<Record<string, unknown>>;
    },
    [proxyFetch],
  );

  const getGraphDef = useCallback(
    async (assistantId: string): Promise<LangGraphGraphDef> => {
      // Try xray=1 — only use it if the server returned proper hierarchical subgraph nodes
      // (nodes with type:"subgraph" AND data.nodes array).  Newer LangGraph servers return
      // a flat Send()-expanded graph that looks broken; we fall back in that case.
      const xrayRes = await proxyFetch(
        `assistants/${assistantId}/graph?xray=1`,
      );
      if (xrayRes.ok) {
        const raw = (await xrayRes.json()) as LangGraphGraphDef;
        const nodes = raw.nodes ?? [];

        // Path 1: hierarchical format (older LangGraph) — nodes have type:"subgraph" with data.nodes
        const hasHierarchical = nodes.some((n) => {
          if (n.type !== "subgraph") return false;
          const d = n.data as Record<string, unknown> | undefined;
          return (
            Array.isArray(d?.nodes) ||
            Array.isArray(
              (d?.graph as Record<string, unknown> | undefined)?.nodes,
            )
          );
        });
        if (hasHierarchical) return deduplicateGraph(raw);

        // Path 2: flat expansion format (newer LangGraph ≥0.3) — inner nodes have "parent:child" ids
        const hasFlatExpansion = nodes.some(
          (n) => n.id.includes(":") && !n.id.startsWith(":"),
        );
        if (hasFlatExpansion) return reconstructSubgraphs(raw);
      }
      // Plain graph: always the correct high-level structure; deduplicate for safety
      const res = await proxyFetch(`assistants/${assistantId}/graph`);
      if (!res.ok) throw new Error(`Failed to get graph: ${res.status}`);
      const raw = (await res.json()) as LangGraphGraphDef;
      return deduplicateGraph(raw);
    },
    [proxyFetch],
  );

  const getThreadState = useCallback(
    async (threadId: string): Promise<unknown> => {
      const res = await proxyFetch(`threads/${threadId}/state`);
      if (!res.ok) throw new Error(`Failed to get thread state: ${res.status}`);
      return res.json();
    },
    [proxyFetch],
  );

  const getThread = useCallback(
    async (
      threadId: string,
    ): Promise<{ thread_id: string; status: string }> => {
      const res = await proxyFetch(`threads/${threadId}`);
      if (!res.ok) throw new Error(`Failed to get thread: ${res.status}`);
      return res.json() as Promise<{ thread_id: string; status: string }>;
    },
    [proxyFetch],
  );

  const createThread = useCallback(async (): Promise<LangGraphThread> => {
    const res = await proxyFetch("threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`);
    return res.json() as Promise<LangGraphThread>;
  }, [proxyFetch]);

  const streamRun = useCallback(
    (
      threadId: string,
      assistantId: string,
      input: Record<string, unknown>,
    ): ReadableStream<Uint8Array> | null => {
      if (!serverId) return null;
      const url = buildProxyUrl(
        projectId,
        serverId,
        `threads/${threadId}/runs/stream`,
      );
      const controller = new AbortController();
      const stream = new ReadableStream<Uint8Array>({
        async start(streamCtrl) {
          try {
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                assistant_id: assistantId,
                input,
                stream_mode: "updates",
                stream_subgraphs: (() => {
                  try {
                    const rc = serverUrl
                      ? localStorage.getItem(
                          `agent-studio:run-config:${serverUrl}`,
                        )
                      : null;
                    return rc
                      ? ((JSON.parse(rc) as { streamSubgraphs?: boolean })
                          .streamSubgraphs ?? true)
                      : true;
                  } catch {
                    return true;
                  }
                })(),
              }),
              signal: controller.signal,
            });
            if (!res.ok || !res.body) {
              streamCtrl.error(new Error(`Stream failed: ${res.status}`));
              return;
            }
            const reader = res.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              streamCtrl.enqueue(value);
            }
            streamCtrl.close();
          } catch (err) {
            if ((err as Error).name !== "AbortError") {
              streamCtrl.error(err);
            } else {
              streamCtrl.close();
            }
          }
        },
        cancel() {
          controller.abort();
        },
      });
      return stream;
    },
    [projectId, serverId, serverUrl],
  );

  return {
    listAssistants,
    getSchema,
    getGraphDef,
    getThreadState,
    getThread,
    createThread,
    streamRun,
    proxyFetch,
  };
}
