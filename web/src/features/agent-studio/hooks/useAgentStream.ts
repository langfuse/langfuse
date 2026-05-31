import { useCallback, useRef, useState } from "react";
import { type NodeEvent, type StreamState } from "../types";

function parseSSEChunk(
  chunk: string,
  pendingRef: { current: string },
): Array<{ event: string; data: string }> {
  const full = pendingRef.current + chunk;
  const blocks = full.split("\n\n");
  pendingRef.current = blocks.pop() ?? "";
  const results: Array<{ event: string; data: string }> = [];
  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split("\n");
    let event = "message";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data = line.slice(5).trim();
    }
    results.push({ event, data });
  }
  return results;
}

export function useAgentStream() {
  const [state, setState] = useState<StreamState>({ status: "idle" });
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
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
        while (true) {
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
            if (event === "end") break;
            if (event === "error") {
              const msg = (() => {
                try {
                  return (JSON.parse(data) as { message?: string }).message ?? data;
                } catch {
                  return data;
                }
              })();
              setState({ status: "error", events, error: msg, runId });
              return events;
            }
            if (event === "updates" || event === "values") {
              let parsed2: Record<string, unknown> = {};
              try {
                parsed2 = JSON.parse(data) as Record<string, unknown>;
              } catch {
                continue;
              }
              for (const [nodeName, nodeData] of Object.entries(parsed2)) {
                const now = Date.now();
                const startTime = startTimesRef.current[nodeName] ?? now;
                startTimesRef.current[nodeName] = startTime;
                const nodeEvent: NodeEvent = {
                  id: `${nodeName}-${now}`,
                  nodeName,
                  type: event,
                  data: nodeData,
                  durationMs: now - startTime,
                  status: "success",
                };
                events.push(nodeEvent);
                setState({
                  status: "running",
                  events: [...events],
                  runId,
                });
              }
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
