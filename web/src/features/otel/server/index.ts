import { type IngestionEventType } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { ObservationLevel } from "@prisma/client";

/**
 * Accepts an OpenTelemetry resourceSpan from a ExportTraceServiceRequest and
 * returns a list of Langfuse events.
 * We use a list type here, because a root span should create a trace, i.e. we
 * may have a 1:N case.
 */
export const convertOtelSpanToIngestionEvent = (
  resourceSpan: any,
): IngestionEventType[] => {
  const resourceAttributes = resourceSpan?.resource?.attributes.reduce(
    (acc: any, attr: any) => {
      acc[attr.key] = attr.value;
      return acc;
    },
    {},
  );

  const events: IngestionEventType[] = [];

  for (const scopeSpan of resourceSpan?.scopeSpans ?? []) {
    for (const span of scopeSpan?.spans ?? []) {
      const attributes = span.attributes.reduce((acc: any, attr: any) => {
        acc[attr.key] = attr.value;
        return acc;
      }, {});

      if (!span?.parentSpanId) {
        // Create a trace for any root span
        const trace = {
          id: Buffer.from(span.traceId.data).toString("hex"),
          timestamp: new Date(
            span.startTimeUnixNano.high * 1e9 + span.startTimeUnixNano.low,
          ).toISOString(),
          metadata: {
            resourceAttributes,
          },
        };
        events.push({
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: trace,
        });
      }

      const observation = {
        // Required fields that must be available
        id: Buffer.from(span.spanId.data).toString("hex"),
        traceId: Buffer.from(span.traceId.data).toString("hex"),
        parentObservationId: span?.parentSpanId
          ? Buffer.from(span.parentSpanId.data).toString("hex")
          : null,
        name: span.name,
        startTime: new Date(
          span.startTimeUnixNano.high * 1e9 + span.startTimeUnixNano.low,
        ).toISOString(),
        endTime: new Date(
          span.endTimeUnixNano.high * 1e9 + span.endTimeUnixNano.low,
        ).toISOString(),

        // Additional fields
        metadata: {
          attributes,
          resourceAttributes,
          scope: scopeSpan?.scope,
        },
        level:
          span.status?.code === 1
            ? ObservationLevel.DEFAULT
            : ObservationLevel.ERROR,

        // Input and Output
        input: span?.events?.find(
          (event: Record<string, unknown>) =>
            event.name === "gen_ai.content.prompt",
        )?.attributes,
        output: span?.events?.find(
          (event: Record<string, unknown>) =>
            event.name === "gen_ai.content.completion",
        )?.attributes,
      };

      // If the span has any gen_ai attributes, we consider it a generation
      const isGeneration = Object.keys(attributes).some((key) =>
        key.startsWith("gen_ai"),
      );

      events.push({
        id: randomUUID(),
        type: isGeneration ? "generation-create" : "span-create",
        timestamp: new Date().toISOString(),
        body: observation,
      });
    }
  }
  return events;
};
