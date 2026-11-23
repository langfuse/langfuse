import { useMemo } from "react";
import { api } from "@/src/utils/api";
import {
  adaptEventsToTraceFormat,
  type EventsTraceObservation,
} from "@/src/features/events/lib/eventsToTraceAdapter";

export function useSessionTraceData({
  projectId,
  sessionId,
  enabled = true,
}: {
  projectId: string;
  sessionId: string | null;
  enabled?: boolean;
}) {
  const query = api.sessions.observationsForSessionFromEvents.useQuery(
    { projectId, sessionId: sessionId ?? "" },
    {
      enabled: enabled && sessionId !== null,
      staleTime: 60 * 1000,
      retry: false,
      meta: { silentHttpCodes: [401, 403, 404] },
    },
  );
  const data = useMemo(() => {
    if (!query.data) return undefined;
    const grouped = new Map<string, EventsTraceObservation[]>();
    for (const observation of query.data.observations) {
      if (!observation.traceId) continue;
      const group = grouped.get(observation.traceId) ?? [];
      group.push(observation);
      grouped.set(observation.traceId, group);
    }
    const entries = [...grouped].map(([traceId, events]) =>
      adaptEventsToTraceFormat({ events, traceId }),
    );
    return {
      ...query.data,
      traces: entries.map((entry) => entry.trace),
      observations: entries.flatMap((entry) => entry.observations),
    };
  }, [query.data]);

  return { ...query, data };
}
