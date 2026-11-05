import { useMemo } from "react";
import { api } from "@/src/utils/api";
import { type TraceProps } from "../components/Trace";
import {
  adaptEventsToTraceFormat,
  type EventsTraceObservation,
} from "@/src/features/events/lib/eventsToTraceAdapter";

export function useSessionScopeData({
  projectId,
  trace,
  observations: loadedObservations,
  scores,
  corrections,
  scopeToSession,
  isPlaceholderData,
}: Pick<
  TraceProps,
  | "projectId"
  | "trace"
  | "observations"
  | "scores"
  | "corrections"
  | "isPlaceholderData"
> & {
  scopeToSession: boolean;
}) {
  const sessionQuery = api.sessions.observationsForSessionFromEvents.useQuery(
    { projectId, sessionId: trace.sessionId ?? "" },
    {
      enabled: scopeToSession && !isPlaceholderData,
      staleTime: 60 * 1000,
      retry: false,
      meta: { silentHttpCodes: [401, 403, 404] },
    },
  );
  const sessionData = useMemo(() => {
    if (!scopeToSession || !sessionQuery.data) return undefined;
    const grouped = new Map<string, EventsTraceObservation[]>();
    for (const observation of sessionQuery.data.observations) {
      if (!observation.traceId) continue;
      const group = grouped.get(observation.traceId) ?? [];
      group.push(observation);
      grouped.set(observation.traceId, group);
    }
    const entries = [...grouped].map(([traceId, events]) =>
      adaptEventsToTraceFormat({ events, traceId }),
    );
    const traces = entries.map((entry) =>
      entry.trace.id === trace.id ? trace : entry.trace,
    );
    if (!grouped.has(trace.id)) traces.push(trace);
    // The session cap must not discard the trace the user already opened.
    const observations = new Map(
      entries
        .flatMap((entry) => entry.observations)
        .map((observation) => [
          `${observation.traceId}:${observation.id}`,
          observation,
        ]),
    );
    for (const observation of loadedObservations) {
      observations.set(`${observation.traceId}:${observation.id}`, observation);
    }
    return {
      traces,
      observations: [...observations.values()],
      scores: [
        ...new Map(
          [...sessionQuery.data.scores, ...scores].map((score) => [
            score.id,
            score,
          ]),
        ).values(),
      ],
      corrections: [
        ...new Map(
          [...sessionQuery.data.corrections, ...corrections].map((score) => [
            score.id,
            score,
          ]),
        ).values(),
      ],
    };
  }, [
    scopeToSession,
    sessionQuery.data,
    trace,
    loadedObservations,
    scores,
    corrections,
  ]);
  return { sessionQuery, sessionData };
}
