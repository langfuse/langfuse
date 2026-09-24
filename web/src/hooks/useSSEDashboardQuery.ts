import { useState } from "react";
import { hashKey, useQuery, type QueryKey } from "@tanstack/react-query";
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

type SSEQueryResult = {
  data: Record<string, unknown>[] | undefined;
  progress: QueryProgress | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: string | null;
  fetchStatus: "fetching" | "paused" | "idle";
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

// A stream that stops producing bytes for this long is dead — the server caps
// query execution well below this, and progress events flow throughout.
const SSE_STALL_TIMEOUT_MS = 60_000;

/**
 * Consumes one execute-query SSE stream to completion and returns its rows.
 * Progress events go to the caller as a side channel (they are high-frequency
 * and must stay out of the query cache). A stream that stalls (no bytes for
 * `stallTimeoutMs`) is aborted and surfaces as a normal error — never as a
 * forever-pending query holding a scheduler slot.
 *
 * Exported for tests; the hook below is the only production caller.
 */
export async function fetchDashboardSSERows(
  input: DashboardExecuteQueryInput,
  {
    basePath,
    signal,
    onProgress,
    stallTimeoutMs = SSE_STALL_TIMEOUT_MS,
  }: {
    basePath: string;
    signal: AbortSignal;
    onProgress: (progress: QueryProgress) => void;
    stallTimeoutMs?: number;
  },
): Promise<Record<string, unknown>[]> {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (signal.aborted) controller.abort();
  signal.addEventListener("abort", onOuterAbort);

  let stalled = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const armWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, stallTimeoutMs);
  };

  let maxPercent = 0;
  const rows: Record<string, unknown>[] = [];

  try {
    armWatchdog();
    const resp = await fetch(`${basePath}/api/dashboard/execute-query-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

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
    let done: "success" | "error" | null = null;
    let errorMessage = "";

    const handleEvent = (event: SSEEvent) => {
      if (done) return;
      if (event.type === "progress") {
        try {
          const p = JSON.parse(event.data);
          const readRows = Number(p.read_rows);
          const totalRows = Number(p.total_rows_to_read);
          maxPercent = computeMonotonicPercent(readRows, totalRows, maxPercent);
          onProgress({
            read_rows: readRows,
            total_rows_to_read: totalRows,
            elapsed_ns: Number(p.elapsed_ns),
            read_bytes: Number(p.read_bytes),
            percent: maxPercent,
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
        done = "success";
      } else if (event.type === "error") {
        try {
          const err = JSON.parse(event.data);
          errorMessage = err.message ?? "Unknown error";
        } catch {
          errorMessage = event.data;
        }
        done = "error";
      }
    };

    while (!done) {
      const { done: streamEnded, value } = await reader.read();
      if (streamEnded) break;
      armWatchdog();

      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = parseSSEBuffer(buffer);
      buffer = remaining;

      for (const event of events) {
        handleEvent(event);
      }
    }

    // Flush any remaining buffer (e.g. "done" event without trailing newline)
    if (!done && buffer.trim()) {
      const { events } = parseSSEBuffer(buffer + "\n\n");
      for (const event of events) {
        handleEvent(event);
      }
    }

    if (done === "error") {
      throw new Error(errorMessage);
    }
    // No terminal event = the stream was cut (server crash, proxy timeout).
    // Partial rows must not land in the query cache as a fresh success and
    // silently render an incomplete chart — fail visibly instead.
    if (done !== "success") {
      throw new Error("Stream ended unexpectedly");
    }
    return rows;
  } catch (error) {
    if (stalled) {
      throw new Error("The query stream stalled and was aborted");
    }
    throw error;
  } finally {
    clearTimeout(watchdog);
    signal.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * SSE transport for a dashboard executeQuery, backed by the React Query
 * cache: rows/status live in the cache under the SAME key as the tRPC
 * transport, so identical widgets share one ClickHouse stream (dedupe), a
 * transport flip reuses cached rows, and cache/gc policy applies uniformly.
 * Only the high-frequency progress events stay out of the cache, as local
 * state on the mount that initiated the fetch.
 */
export function useSSEDashboardQuery(
  input: DashboardExecuteQueryInput,
  options: {
    enabled?: boolean;
    queryKey: QueryKey;
    staleTime: number;
    gcTime: number;
    meta?: Record<string, unknown>;
  },
): SSEQueryResult {
  const { enabled = true, queryKey, staleTime, gcTime, meta } = options;
  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";

  const [progress, setProgress] = useState<QueryProgress | null>(null);
  // A new key is a new run: drop the previous run's progress in the same
  // render instead of showing it over the fresh pending state.
  const keyHash = hashKey(queryKey);
  const [lastKeyHash, setLastKeyHash] = useState(keyHash);
  if (lastKeyHash !== keyHash) {
    setLastKeyHash(keyHash);
    setProgress(null);
  }

  const query = useQuery<Record<string, unknown>[], Error>({
    queryKey,
    queryFn: async ({ signal }) => {
      setProgress(null);
      return fetchDashboardSSERows(input, {
        basePath,
        signal,
        onProgress: setProgress,
      });
    },
    enabled,
    staleTime,
    gcTime,
    // A failed stream must fail visibly (inline widget error + released
    // scheduler slot), not silently re-run a heavy ClickHouse query.
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    // The widget owns the error UX; the global toast handler stays silent.
    meta: { ...meta, silentAllErrors: true },
  });

  return {
    // An errored re-run must not keep stale success rows behind the error
    // state (keep-previous-data applies to in-flight/success only).
    data: query.isError ? undefined : query.data,
    progress: query.isError ? null : progress,
    isLoading: query.isLoading,
    isSuccess: query.isSuccess,
    isError: query.isError,
    error: query.error ? query.error.message : null,
    fetchStatus: query.fetchStatus,
    isPending: query.isPending,
  };
}
