import { useCallback, useRef, useState } from "react";
import { type NodeEvent, type StreamState } from "../types";

function parseSSEChunk(
  chunk: string,
  pendingRef: { current: string },
): Array<{ event: string; data: string }> {
  // Normalize \r\n to \n so proxied SSE from any server works consistently
  const full = (pendingRef.current + chunk).replace(/\r\n/g, "\n");
  const blocks = full.split("\n\n");
  pendingRef.current = blocks.pop() ?? "";
  const results: Array<{ event: string; data: string }> = [];
  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split("\n");
    let event = "message";
    const dataParts: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataParts.push(line.slice(5).trim());
    }
    if (dataParts.length > 0) {
      results.push({ event, data: dataParts.join("\n") });
    }
  }
  return results;
}

export function useAgentStream() {
  const [state, setState] = useState<StreamState>({ status: "idle" });
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null,
  );
  const pendingRef = useRef<string>("");
  const startTimesRef = useRef<Record<string, number>>({});

  const cancel = useCallback(() => {
    readerRef.current?.cancel();
    readerRef.current = null;
    setState((prev) =>
      prev.status === "running"
        ? { status: "done", events: prev.events, runId: prev.runId }
        : prev,
    );
  }, []);

  const run = useCallback(
    async (stream: ReadableStream<Uint8Array>): Promise<NodeEvent[]> => {
      const events: NodeEvent[] = [];
      let runId: string | null = null;
      pendingRef.current = "";
      setState({ status: "running", events: [], runId: null });

      const reader = stream.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();

      try {
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const parsed = parseSSEChunk(chunk, pendingRef);

          for (const { event, data } of parsed) {
            if (event === "metadata") {
              try {
                const meta = JSON.parse(data) as { run_id?: string };
                if (meta.run_id) runId = meta.run_id;
              } catch {
                // ignore parse errors
              }
              continue;
            }
            if (event === "end") break outer;
            if (event === "error") {
              const msg = (() => {
                try {
                  return (
                    (JSON.parse(data) as { message?: string }).message ?? data
                  );
                } catch {
                  return data;
                }
              })();
              setState({ status: "error", events, error: msg, runId });
              return events;
            }
            // Handle both outer graph events ("updates") and inner subgraph events
            // ("updates|subgraphName:instance-uuid") sent when stream_subgraphs=true
            if (event === "updates" || event.startsWith("updates|")) {
              // Extract subgraph namespace from event type: "updates|subgraph_name:abc" → "subgraph_name:abc"
              const subgraphNs = event.includes("|")
                ? (event.split("|")[1] ?? undefined)
                : undefined;

              let parsed2: Record<string, unknown> = {};
              try {
                parsed2 = JSON.parse(data) as Record<string, unknown>;
              } catch {
                continue;
              }
              const now = Date.now();
              for (const [key, value] of Object.entries(parsed2)) {
                const isPythonNamespace =
                  key.startsWith("(") || key.startsWith("[");
                let entries: Array<[string, unknown]>;

                if (
                  isPythonNamespace &&
                  typeof value === "object" &&
                  value !== null
                ) {
                  entries = Object.entries(value as Record<string, unknown>);
                } else {
                  entries = [[key, value]];
                }

                for (const [nodeName, nodeData] of entries) {
                  const trackKey = subgraphNs
                    ? `${subgraphNs}:${nodeName}`
                    : nodeName;
                  const startTime = startTimesRef.current[trackKey] ?? now;
                  startTimesRef.current[trackKey] = startTime;
                  const nodeEvent: NodeEvent = {
                    id: `${trackKey}-${now}-${Math.random().toString(36).slice(2, 6)}`,
                    nodeName,
                    subgraphNs,
                    type: "updates",
                    data: nodeData,
                    durationMs: now - startTime,
                    receivedAt: now,
                    status: "success",
                  };
                  events.push(nodeEvent);
                  setState({ status: "running", events: [...events], runId });
                }
              }
            }
            if (event === "values") {
              // Full state snapshot — show as a single "state" card
              let parsed2: unknown = {};
              try {
                parsed2 = JSON.parse(data);
              } catch {
                continue;
              }
              const now = Date.now();
              const nodeEvent: NodeEvent = {
                id: `__state__-${now}`,
                nodeName: "__state__",
                type: "values",
                data: parsed2,
                durationMs: 0,
                receivedAt: now,
                status: "success",
              };
              // Replace previous state snapshot rather than accumulating
              const idx = events.findIndex((e) => e.nodeName === "__state__");
              if (idx >= 0) events[idx] = nodeEvent;
              else events.push(nodeEvent);
              setState({ status: "running", events: [...events], runId });
            }
          }
        }
        setState({ status: "done", events, runId });
        return events;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        setState({ status: "error", events, error: msg, runId });
        return events;
      } finally {
        readerRef.current = null;
        startTimesRef.current = {};
      }
    },
    [],
  );

  const reset = useCallback(() => {
    cancel();
    setState({ status: "idle" });
  }, [cancel]);

  return { state, run, cancel, reset };
}
