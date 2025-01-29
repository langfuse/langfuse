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

const convertValueToPlainJavascript = (value: Record<string, any>): any => {
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }
  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }
  if (value.boolValue !== undefined) {
    return value.boolValue;
  }
  if (value.arrayValue && value.arrayValue.values !== undefined) {
    return value.arrayValue.values.map(convertValueToPlainJavascript);
  }
  if (value.intValue && value.intValue.high === 0) {
    return value.intValue.low;
  }
  if (value.intValue && value.intValue.high !== 0) {
    return value; // We keep the `long` format here as is to handle INTs with more than 32 bits.
  }
  return JSON.stringify(value);
};

const extractInputAndOutput = (
  events: any[],
  attributes: Record<string, unknown>,
): { input: any; output: any } => {
  // Openlit uses events property
  let input = events.find(
    (event: Record<string, unknown>) => event.name === "gen_ai.content.prompt",
  )?.attributes;
  let output = events.find(
    (event: Record<string, unknown>) =>
      event.name === "gen_ai.content.completion",
  )?.attributes;
  if (input || output) {
    return { input, output };
  }

  // TraceLoop uses attributes property
  const inputAttributes = Object.keys(attributes).filter((key) =>
    key.startsWith("gen_ai.prompt"),
  );
  const outputAttributes = Object.keys(attributes).filter((key) =>
    key.startsWith("gen_ai.completion"),
  );
  if (inputAttributes.length > 0 || outputAttributes.length > 0) {
    input = inputAttributes.reduce((acc: any, key) => {
      acc[key] = attributes[key];
      return acc;
    }, {});
    output = outputAttributes.reduce((acc: any, key) => {
      acc[key] = attributes[key];
      return acc;
    }, {});
    return { input, output };
  }

  return { input: null, output: null };
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
      acc[attr.key] = convertValueToPlainJavascript(attr.value);
      return acc;
    }, {}) ?? {};

  const events: IngestionEventType[] = [];

  for (const scopeSpan of resourceSpan?.scopeSpans ?? []) {
    for (const span of scopeSpan?.spans ?? []) {
      const attributes =
        span?.attributes?.reduce((acc: any, attr: any) => {
          acc[attr.key] = convertValueToPlainJavascript(attr.value);
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
        ...extractInputAndOutput(span?.events ?? [], attributes),
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
