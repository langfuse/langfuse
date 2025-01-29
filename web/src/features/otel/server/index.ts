import { type IngestionEventType } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { ObservationLevel } from "@prisma/client";

const convertNanoTimestampToISO = (timestamp: {
  high: number;
  low: number;
}) => {
  return new Date(
    (timestamp.high * Math.pow(2, 32) + timestamp.low) / 1e6,
  ).toISOString();
};

/**
 * Accepts an OpenTelemetry resourceSpan from a ExportTraceServiceRequest and
 * returns a list of Langfuse events.
 * We use a list type here, because a root span should create a trace, i.e. we
 * may have a 1:N case.
 */
export const convertOtelSpanToIngestionEvent = (
  resourceSpan: any,
): IngestionEventType[] => {
  const resourceAttributes =
    resourceSpan?.resource?.attributes?.reduce((acc: any, attr: any) => {
      acc[attr.key] = JSON.stringify(attr.value);
      return acc;
    }, {}) ?? {};

  const events: IngestionEventType[] = [];

  for (const scopeSpan of resourceSpan?.scopeSpans ?? []) {
    for (const span of scopeSpan?.spans ?? []) {
      const attributes =
        span?.attributes?.reduce((acc: any, attr: any) => {
          acc[attr.key] = JSON.stringify(attr.value);
          return acc;
        }, {}) ?? {};

      if (!span?.parentSpanId) {
        // Create a trace for any root span
        const trace = {
          id: Buffer.from(span.traceId?.data ?? span.traceId).toString("hex"),
          timestamp: convertNanoTimestampToISO(span.startTimeUnixNano),
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
        id: Buffer.from(span.spanId?.data ?? span.spanId).toString("hex"),
        traceId: Buffer.from(span.traceId?.data ?? span.traceId).toString(
          "hex",
        ),
        parentObservationId: span?.parentSpanId
          ? Buffer.from(span.parentSpanId?.data ?? span.parentSpanId).toString(
              "hex",
            )
          : null,
        name: span.name,
        startTime: convertNanoTimestampToISO(span.startTimeUnixNano),
        endTime: convertNanoTimestampToISO(span.endTimeUnixNano),

        // Additional fields
        metadata: {
          attributes,
          resourceAttributes,
          scope: scopeSpan?.scope,
        },
        level:
          span.status?.code === 2
            ? ObservationLevel.ERROR
            : ObservationLevel.DEFAULT,

        // Input and Output
        // TODO: Those events usually have timestamps associated with them.
        // Do we want to track them as well or is it sufficient to know they occurred within the span?
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
