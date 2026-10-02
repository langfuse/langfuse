import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import PQueue from "p-queue";
import { api, type RouterOutputs } from "@/src/utils/api";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";

export type SessionTraceTranscriptState =
  | { state: "loading" }
  | { state: "error" }
  | ({ state: "loaded" } & RouterOutputs["events"]["transcriptByTraceId"]);

export function useSessionTraceTranscripts({
  projectId,
  traces,
  activeTraceIds,
}: {
  projectId: string;
  traces: readonly { trace: EventSessionTrace; turnNumber: number }[];
  activeTraceIds: ReadonlySet<string>;
}): Map<string, SessionTraceTranscriptState> {
  const [queue] = useState(() => new PQueue({ concurrency: 4 }));
  const utils = api.useUtils();
  const activeTraces = traces.filter(({ trace }) =>
    activeTraceIds.has(trace.id),
  );
  const results = useQueries({
    queries: activeTraces.map(({ trace }) => {
      const input = {
        projectId,
        traceId: trace.id,
        timestamp: trace.timestamp,
      };
      return {
        queryKey: getQueryKey(api.events.transcriptByTraceId, input, "query"),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          queue.add(
            () =>
              utils.client.events.transcriptByTraceId.query(input, { signal }),
            { signal },
          ),
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: false,
        meta: { silentAllErrors: true },
      };
    }),
  });

  return new Map(
    activeTraces.map(({ trace }, index) => {
      const result = results[index];
      let state: SessionTraceTranscriptState = { state: "loading" };
      if (result?.data) {
        state = { state: "loaded", ...result.data };
      } else if (result?.isError) {
        state = { state: "error" };
      }
      return [trace.id, state];
    }),
  );
}
