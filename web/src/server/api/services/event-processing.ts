import {
  type ObservationEvent,
  eventTypes,
  ingestionEvent,
} from "@/src/features/public-api/server/ingestion-api-schema";
import { type Observation } from "@langfuse/shared";
import { type z } from "zod";
import { prisma } from "@langfuse/shared/src/db";

export function clean(events: z.infer<typeof ingestionEvent>[]) {
  return events.map((event) => ingestionEvent.parse(cleanEvent(event)));
}

// cleans NULL characters from the event
export function cleanEvent(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\u0000/g, "");
  } else if (typeof obj === "object" && obj !== null) {
    if (Array.isArray(obj)) {
      return obj.map(cleanEvent);
    } else {
      // Here we assert that obj is a Record<string, unknown>
      const objAsRecord = obj as Record<string, unknown>;
      const newObj: Record<string, unknown> = {};
      for (const key in objAsRecord) {
        newObj[key] = cleanEvent(objAsRecord[key]);
      }
      return newObj;
    }
  } else {
    return obj;
  }
}

export function sort(events: z.infer<typeof ingestionEvent>[]) {
  // sort events by timestamp
  const updates = events.filter(
    (event) => event.type === eventTypes.OBSERVATION_UPDATE,
  );

  // Keep all other events in their original order
  const others = events.filter(
    (event) => event.type !== eventTypes.OBSERVATION_UPDATE,
  );

  // Return the array with non-update events first, followed by update events
  return [...others, ...updates];
}

export class EventContext {
  events: ObservationEvent[];
  existingObservation?: Observation;
  constructor(events: ObservationEvent[], existingEvent?: Observation) {
    this.events = events;
    this.existingObservation = existingEvent;
  }
}

// gets all relevant observations form the database
// groups all observations by id, and adds the existing observation to the eventContext
export async function enrichObservations(
  events: z.infer<typeof ingestionEvent>[],
  projectId: string,
) {
  // fetch all relevant data for the events
  const observations = events.filter(
    (event) =>
      event.type === eventTypes.OBSERVATION_UPDATE ||
      event.type === eventTypes.OBSERVATION_CREATE ||
      event.type === eventTypes.GENERATION_CREATE ||
      event.type === eventTypes.GENERATION_UPDATE ||
      event.type === eventTypes.SPAN_CREATE ||
      event.type === eventTypes.SPAN_UPDATE ||
      event.type === eventTypes.EVENT_CREATE,
  ) as ObservationEvent[];

  const scores = events.filter(
    (event) => event.type === eventTypes.SCORE_CREATE,
  );

  const sdkLogs = events.filter((event) => event.type === eventTypes.SDK_LOG);

  const traces = events.filter(
    (event) => event.type === eventTypes.TRACE_CREATE,
  );

  // group events by
  const eventContexts = observations.reduce((acc, event) => {
    const id = (
      "id" in event.body
        ? event.body.id
        : "generationId" in event.body
          ? event.body.generationId
          : "spanId" in event.body
            ? event.body.spanId
            : undefined
    ) as string | undefined;

    if (!id) {
      return acc;
    }

    const mapEvent = acc.get(id);
    if (!mapEvent) {
      acc.set(event.id, new EventContext([event]));
    } else {
      mapEvent.events.push(event);
    }
    return acc;
  }, new Map<string, EventContext>());

  const existingObservations = await prisma.observation.findMany({
    where: {
      projectId: projectId,
      id: { in: Array.from(eventContexts.keys()) },
    },
  });

  // add existing events to the eventContexts
  existingObservations.forEach((observation) => {
    const eventContext = eventContexts.get(observation.id);
    if (eventContext) {
      eventContext.existingObservation = observation;
    }
  });
  return { enrichedObservations: eventContexts, scores, sdkLogs, traces };
}
