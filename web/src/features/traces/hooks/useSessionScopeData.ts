import { useMemo } from "react";
import { useSessionTraceData } from "./useSessionTraceData";
import { type TraceDataTrace } from "../types/traceScope";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

export function useSessionScopeData({
  projectId,
  trace,
  observations: loadedObservations,
  scores,
  corrections,
  scopeToSession,
  isPlaceholderData,
}: {
  projectId: string;
  trace: TraceDataTrace;
  observations: ObservationReturnTypeWithMetadata[];
  scores: WithStringifiedMetadata<ScoreDomain>[];
  corrections: ScoreDomain[];
  isPlaceholderData?: boolean;
  scopeToSession: boolean;
}) {
  const sessionQuery = useSessionTraceData({
    projectId,
    sessionId: trace.sessionId,
    enabled: scopeToSession && !isPlaceholderData,
  });
  const sessionData = useMemo(() => {
    if (!scopeToSession || !sessionQuery.data) return undefined;
    const traces = sessionQuery.data.traces.map((entry) =>
      entry.id === trace.id ? trace : entry,
    );
    if (!traces.some((entry) => entry.id === trace.id)) traces.push(trace);
    // The session cap must not discard the trace the user already opened.
    const observations = new Map(
      sessionQuery.data.observations.map((observation) => [
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
