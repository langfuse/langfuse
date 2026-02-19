import { type EventsObservation, type TraceDomain } from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

export type SyntheticTrace = WithStringifiedMetadata<
  Omit<TraceDomain, "input" | "output">
> & {
  input: string | null;
  output: string | null;
  latency?: number;
  rootObservationType?: string;
  rootObservationId?: string;
};

export interface AdaptedTraceData {
  trace: SyntheticTrace;
  observations: ObservationReturnTypeWithMetadata[];
}

/**
 * Adapts events (observations from events table) to the trace format expected by the Trace component.
 *
 * In v4, traces don't exist as separate entities - we synthesize a "trace" object from observations.
 * The root observation (no parentObservationId) provides trace-level properties like name.
 */
export function adaptEventsToTraceFormat(params: {
  events: EventsObservation[];
  traceId: string;
  rootIO?: { input: unknown; output: unknown } | null;
}): AdaptedTraceData {
  const { events, traceId, rootIO } = params;

  if (events.length === 0) {
    throw new Error("Cannot adapt empty events array to trace format");
  }

  // Sort by startTime to find earliest
  const sorted = [...events].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
  const earliest = sorted[0]!;

  // TODO: think, how to determine root span?
  const root = events.find((e) => !e.parentObservationId);

  const endTimes = events
    .map((e) => e.endTime)
    .filter((t): t is Date => t !== null);
  const latestEnd =
    endTimes.length > 0 ? Math.max(...endTimes.map((d) => d.getTime())) : null;
  const latencyMs = latestEnd
    ? latestEnd - earliest.startTime.getTime()
    : undefined;

  // Create synthetic trace from observations
  const trace: SyntheticTrace = {
    id: traceId,
    projectId: earliest.projectId,
    name: root?.name ?? earliest.name ?? null,
    timestamp: earliest.startTime,
    input: rootIO?.input ? JSON.stringify(rootIO.input) : null,
    output: rootIO?.output ? JSON.stringify(rootIO.output) : null,
    metadata: JSON.stringify(root?.metadata ?? {}),
    tags: [], // Events have tags on each observation, not trace-level
    bookmarked: false,
    public: false,
    release: earliest.version ?? null,
    version: earliest.version ?? null,
    userId: earliest.userId ?? null,
    sessionId: earliest.sessionId ?? null,
    environment: earliest.environment,
    latency: latencyMs !== undefined ? latencyMs / 1000 : undefined,
    createdAt: earliest.createdAt,
    updatedAt: earliest.updatedAt,
    rootObservationType: root?.type,
    rootObservationId: root?.id,
  };

  // Map events to ObservationReturnTypeWithMetadata
  // Input/output are undefined - they're fetched separately when observation is selected
  const observations: ObservationReturnTypeWithMetadata[] = events.map((e) => ({
    ...e,
    traceId: traceId,
    metadata:
      typeof e.metadata === "string" ? e.metadata : JSON.stringify(e.metadata),
    input: undefined,
    output: undefined,
  }));

  return { trace, observations };
}
