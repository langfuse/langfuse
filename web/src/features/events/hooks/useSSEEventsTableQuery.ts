import { env } from "@/src/env.mjs";
import {
  computeMonotonicPercent,
  parseSSEBuffer,
  type QueryProgress,
  type SSEEvent,
} from "@/src/hooks/useSSEDashboardQuery";
import { type FilterState, type ScoreAggregate } from "@langfuse/shared";
import type { FullEventsObservations } from "@langfuse/shared/src/server";
import superjson from "superjson";
import { useCallback, useEffect, useRef, useState } from "react";

type EventsTableObservation = FullEventsObservations[number] & {
  scores?: ScoreAggregate;
  traceScores?: ScoreAggregate;
};

type EventsTableStreamInput = {
  projectId: string;
  filter: FilterState;
  searchQuery?: string | null;
  searchType?: readonly ("id" | "content")[];
  orderBy: {
    column: string;
    order: "ASC" | "DESC";
  } | null;
  page: number;
  limit: number;
};

type SSEQueryStatus = "idle" | "loading" | "success" | "error";

export type SSEEventsTableErrorKind = "resource_limit" | "generic";

type SSEEventsTableQueryResult = {
  data: { observations: EventsTableObservation[] } | undefined;
  progress: QueryProgress | null;
  status: SSEQueryStatus;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: string | null;
  errorKind: SSEEventsTableErrorKind | null;
  fetchStatus: "fetching" | "idle";
  isPending: boolean;
  dataUpdatedAt: number;
};

export function useSSEEventsTableQuery(
  input: EventsTableStreamInput,
  options: {
    enabled?: boolean;
    refreshKey?: string | number;
  },
): SSEEventsTableQueryResult {
  const { enabled = true, refreshKey } = options;
  const [data, setData] = useState<{
    observations: EventsTableObservation[];
  }>();
  const [progress, setProgress] = useState<QueryProgress | null>(null);
  const [status, setStatus] = useState<SSEQueryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<SSEEventsTableErrorKind | null>(
    null,
  );
  const [stateInputKey, setStateInputKey] = useState<string | null>(null);
  const [dataUpdatedAt, setDataUpdatedAt] = useState(0);
  const maxPercentRef = useRef(0);
  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";

  const inputRef = useRef(input);
  inputRef.current = input;

  const runQuery = useCallback(
    async (runInputKey: string, signal: AbortSignal) => {
      setStateInputKey(runInputKey);
      setStatus("loading");
      setProgress(null);
      setError(null);
      setErrorKind(null);
      setData(undefined);
      maxPercentRef.current = 0;

      try {
        const resp = await fetch(
          `${basePath}/api/events/execute-table-stream`,
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
        let terminated = false;
        let receivedResult = false;

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
            return;
          }

          if (event.type === "result") {
            try {
              const parsed = JSON.parse(event.data);
              const result = superjson.deserialize<{
                observations: EventsTableObservation[];
              }>(parsed);
              receivedResult = true;
              setData(result);
              setStatus("success");
              setDataUpdatedAt(Date.now());
            } catch {
              setError("Malformed result payload");
              setErrorKind("generic");
              setStatus("error");
              terminated = true;
            }
            return;
          }

          if (event.type === "done") {
            terminated = true;
            if (!receivedResult) {
              setError("Stream ended unexpectedly");
              setErrorKind("generic");
              setStatus("error");
            }
            return;
          }

          if (event.type === "error") {
            try {
              const parsed = JSON.parse(event.data) as {
                kind?: SSEEventsTableErrorKind;
                message?: string;
              };
              setError(parsed.message ?? "Unknown error");
              setErrorKind(parsed.kind ?? "generic");
            } catch {
              setError(event.data);
              setErrorKind("generic");
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

        if (!terminated && buffer.trim()) {
          const { events } = parseSSEBuffer(buffer + "\n\n");
          for (const event of events) {
            handleEvent(event);
          }
        }

        if (!terminated && !receivedResult) {
          setError("Stream ended unexpectedly");
          setErrorKind("generic");
          setStatus("error");
        }
      } catch (err) {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setErrorKind("generic");
        setStatus("error");
      }
    },
    [basePath],
  );

  const inputKey = JSON.stringify({
    input,
    refreshKey,
  });

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
    errorKind: shouldHidePreviousRunState ? null : errorKind,
    fetchStatus: isPendingForCurrentRun ? "fetching" : "idle",
    isPending: isPendingForCurrentRun,
    dataUpdatedAt: shouldHidePreviousRunState ? 0 : dataUpdatedAt,
  };
}
