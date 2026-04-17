import { type TraceDomain } from "@langfuse/shared";
import { type FullEventsObservations } from "@langfuse/shared/src/server";
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
  events: FullEventsObservations;
  traceId: string;
  rootIO?: { input: unknown; output: unknown; metadata?: unknown } | null;
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

  const latestTaggedEvent = events.reduce<
    FullEventsObservations[number] | null
  >((latest, event) => {
    if (event.traceTags.length === 0) return latest;
    if (!latest) return event;

    if (event.updatedAt.getTime() > latest.updatedAt.getTime()) return event;
    if (event.updatedAt.getTime() < latest.updatedAt.getTime()) return latest;

    return event.createdAt.getTime() > latest.createdAt.getTime()
      ? event
      : latest;
  }, null);

  const traceTags = latestTaggedEvent?.traceTags;

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
    metadata: JSON.stringify(rootIO?.metadata ?? root?.metadata ?? {}),
    tags: traceTags ?? [],
    bookmarked: root?.bookmarked ?? false,
    public: root?.public ?? false,
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
