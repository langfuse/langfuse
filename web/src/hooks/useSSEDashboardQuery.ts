import { useCallback, useEffect, useRef, useState } from "react";
import { type RouterInputs } from "@/src/utils/api";
import { env } from "@/src/env.mjs";

type DashboardExecuteQueryInput = RouterInputs["dashboard"]["executeQuery"];

export type QueryProgress = {
  read_rows: number;
  total_rows_to_read: number;
  elapsed_ns: number;
  read_bytes: number;
  percent: number;
};

type SSEQueryStatus = "idle" | "loading" | "success" | "error";

type SSEQueryResult = {
  data: Record<string, unknown>[] | undefined;
  progress: QueryProgress | null;
  status: SSEQueryStatus;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: string | null;
  fetchStatus: "fetching" | "idle";
  isPending: boolean;
};

export type SSEEvent = {
  type: string;
  data: string;
};

export function parseSSEBuffer(buffer: string): {
  events: SSEEvent[];
  remaining: string;
} {
  const events: SSEEvent[] = [];
  const blocks = buffer.split("\n\n");

  // Last block may be incomplete
  const remaining = blocks.pop() ?? "";

  for (const block of blocks) {
    if (!block.trim()) continue;

    let type = "message";
    let data = "";

    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        type = line.slice(7);
      } else if (line.startsWith("data: ")) {
        data = line.slice(6);
      }
    }

    if (data) {
      events.push({ type, data });
    }
  }

  return { events, remaining };
}

export function computeMonotonicPercent(
  readRows: number,
  totalRows: number,
  prevMax: number,
): number {
  const rawPercent = totalRows > 0 ? readRows / totalRows : 0;
  return Math.max(prevMax, rawPercent);
}

export function useSSEDashboardQuery(
  input: DashboardExecuteQueryInput,
  options: {
    enabled?: boolean;
    inputKey?: string;
    queryId: string;
  },
): SSEQueryResult {
  const { enabled = true, inputKey: inputKeyOverride } = options;
  const [data, setData] = useState<Record<string, unknown>[] | undefined>(
    undefined,
  );
  const [progress, setProgress] = useState<QueryProgress | null>(null);
  const [status, setStatus] = useState<SSEQueryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stateInputKey, setStateInputKey] = useState<string | null>(null);
  const maxPercentRef = useRef(0);
  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";

  // Stable reference for the input to avoid re-triggering on every render
  const inputRef = useRef(input);
  inputRef.current = input;

  const runQuery = useCallback(
    async (runInputKey: string, signal: AbortSignal) => {
      setStateInputKey(runInputKey);
      setStatus("loading");
      setProgress(null);
      setError(null);
      setData(undefined);
      maxPercentRef.current = 0;

      try {
        const resp = await fetch(
          `${basePath}/api/dashboard/execute-query-stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(inputRef.current),
            signal,
          },
        );

        if (!resp.ok) {
          const body = await resp.text();
          let message = `HTTP ${resp.status}`;
          try {
            const parsed = JSON.parse(body);
            if (parsed.message) message = parsed.message;
          } catch {
            if (body) message = body;
          }
          throw new Error(message);
        }

        if (!resp.body) {
          throw new Error("No response body");
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const rows: Record<string, unknown>[] = [];
        let terminated = false;

        const handleEvent = (event: SSEEvent) => {
          if (terminated) return;
          if (event.type === "progress") {
            try {
              const p = JSON.parse(event.data);
              const readRows = Number(p.read_rows);
              const totalRows = Number(p.total_rows_to_read);
              const percent = computeMonotonicPercent(
                readRows,
                totalRows,
                maxPercentRef.current,
              );
              maxPercentRef.current = percent;

              setProgress({
                read_rows: readRows,
                total_rows_to_read: totalRows,
                elapsed_ns: Number(p.elapsed_ns),
                read_bytes: Number(p.read_bytes),
                percent,
              });
            } catch {
              // Ignore malformed progress events
            }
          } else if (event.type === "row") {
            try {
              rows.push(JSON.parse(event.data));
            } catch {
              // Ignore malformed row events
            }
          } else if (event.type === "done") {
            setData(rows);
            setStatus("success");
            terminated = true;
          } else if (event.type === "error") {
            try {
              const err = JSON.parse(event.data);
              setError(err.message ?? "Unknown error");
            } catch {
              setError(event.data);
            }
            setStatus("error");
            terminated = true;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const { events, remaining } = parseSSEBuffer(buffer);
          buffer = remaining;

          for (const event of events) {
            handleEvent(event);
          }
        }

        // Flush any remaining buffer (e.g. "done" event without trailing newline)
        if (!terminated && buffer.trim()) {
          const { events } = parseSSEBuffer(buffer + "\n\n");
          for (const event of events) {
            handleEvent(event);
          }
        }

        // Fallback if stream ended without a terminal event
        if (!terminated) {
          if (rows.length > 0) {
            setData(rows);
            setStatus("success");
          } else {
            setError("Stream ended unexpectedly");
            setStatus("error");
          }
        }
      } catch (err) {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    },
    [basePath],
  );

  // Derive a stable key from the input to detect changes
  const inputKey = inputKeyOverride ?? JSON.stringify(input);

  useEffect(() => {
    if (!enabled) {
      setStatus((current) =>
        current === "success" || current === "error" ? current : "idle",
      );
      return;
    }

    const abortController = new AbortController();
    void runQuery(inputKey, abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [enabled, inputKey, runQuery]);

  const hasCurrentState = stateInputKey === inputKey;
  const shouldHidePreviousRunState = enabled && !hasCurrentState;
  const isPendingForCurrentRun =
    enabled &&
    (status === "idle" || status === "loading" || shouldHidePreviousRunState);
  const effectiveStatus = isPendingForCurrentRun ? "loading" : status;

  return {
    data: shouldHidePreviousRunState ? undefined : data,
    progress: shouldHidePreviousRunState ? null : progress,
    status: effectiveStatus,
    isLoading: effectiveStatus === "loading",
    isSuccess: effectiveStatus === "success",
    isError: effectiveStatus === "error",
    error: shouldHidePreviousRunState ? null : error,
    // Compatibility with existing scheduler expectations
    fetchStatus: isPendingForCurrentRun ? "fetching" : "idle",
    isPending: isPendingForCurrentRun,
  };
}
