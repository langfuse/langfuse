import { type MetadataDomain, type TraceDomain } from "@langfuse/shared";
import { type FullEventsObservations } from "@langfuse/shared/src/server";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import {
  stringifyMetadata,
  type WithStringifiedMetadata,
} from "@/src/utils/clientSideDomainTypes";

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

export type EventsTraceObservation = WithStringifiedMetadata<
  FullEventsObservations[number]
>;

/**
 * Adapts events (observations from events table) to the trace format expected by the Trace component.
 *
 * In v4, traces don't exist as separate entities - we synthesize a "trace" object from observations.
 * The root observation (no parentObservationId) provides trace-level properties like name.
 */
export function adaptEventsToTraceFormat(params: {
  events: EventsTraceObservation[];
  traceId: string;
  rootIO?: {
    input: string | null;
    output: string | null;
    metadata?: MetadataDomain | string | null;
  } | null;
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

  // Prefer the explicit root observation when present; otherwise fall back to
  // the earliest observation so the synthetic trace remains self-consistent.
  const root = events.find((e) => !e.parentObservationId);
  const primaryObservation = root ?? earliest;

  const latestTaggedEvent = events.reduce<EventsTraceObservation | null>(
    (latest, event) => {
      if (event.traceTags.length === 0) return latest;
      if (!latest) return event;

      if (event.updatedAt.getTime() > latest.updatedAt.getTime()) return event;
      if (event.updatedAt.getTime() < latest.updatedAt.getTime()) return latest;

      return event.createdAt.getTime() > latest.createdAt.getTime()
        ? event
        : latest;
    },
    null,
  );

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
    name: primaryObservation.name ?? null,
    timestamp: earliest.startTime,
    input: rootIO?.input ?? null,
    output: rootIO?.output ?? null,
    metadata:
      stringifyMetadata(
        rootIO?.metadata ?? primaryObservation?.metadata ?? {},
      ) ?? "{}",
    tags: traceTags ?? [],
    bookmarked: primaryObservation?.bookmarked ?? false,
    public: primaryObservation?.public ?? false,
    release: primaryObservation.release ?? null,
    version: primaryObservation.version ?? null,
    userId: primaryObservation.userId ?? null,
    sessionId: primaryObservation.sessionId ?? null,
    environment: primaryObservation.environment,
    latency: latencyMs !== undefined ? latencyMs / 1000 : undefined,
    createdAt: primaryObservation.createdAt,
    updatedAt: primaryObservation.updatedAt,
    rootObservationType: primaryObservation.type,
    rootObservationId: primaryObservation.id,
  };

  // Map events to ObservationReturnTypeWithMetadata
  // Input/output are undefined - they're fetched separately when observation is selected
  const observations: ObservationReturnTypeWithMetadata[] = events.map((e) => ({
    ...e,
    traceId: traceId,
    metadata: stringifyMetadata(e.metadata) ?? null,
    input: undefined,
    output: undefined,
  }));

  return { trace, observations };
}
