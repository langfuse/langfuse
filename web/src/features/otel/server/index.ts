import { type IngestionEventType } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { ObservationLevel } from "@prisma/client";

const convertNanoTimestampToISO = (
  timestamp:
    | number
    | {
        high: number;
        low: number;
      },
) => {
  if (typeof timestamp === "number") {
    return new Date(timestamp / 1e6).toISOString();
  }
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
  if (value.intValue && typeof value.intValue === "number") {
    return value.intValue;
  }
  if (
    value.intValue &&
    value.intValue.high === -1 &&
    value.intValue.low === -1
  ) {
    return -1;
  }
  if (value.intValue && value.intValue.high !== 0) {
    // As JavaScript has native 64-bit support, we try the conversion
    return value.intValue.high * Math.pow(2, 32) + value.intValue.low;
  }
  return JSON.stringify(value);
};

/**
 * convertKeyPathToNestedObject accepts the result of the naive body parsing and translates it into
 * a nested object. In addition, we remove the prefix from the keys to make them easier to read.
 * Array Example:
 * // Input
 * {
 *     gen_ai.completion.0.content: "Hello World",
 *     gen_ai.completion.0.role: "assistant"
 * }
 * // Output
 * [{ content: "Hello World", role: "assistant" }]
 *
 * Object Example:
 * // Input
 * {
 *    gen_ai.completion.content: "Hello World",
 *    gen_ai.completion.role: "assistant"
 * }
 * // Output
 * { content: "Hello World", role: "assistant" }
 *
 * Plain Example:
 * // Input
 * { gen_ai.completion: "Hello World" }
 * // Output
 * "Hello World"
 */
const convertKeyPathToNestedObject = (
  input: Record<string, unknown>,
  prefix: string,
): any => {
  // Handle base-case where we only have the prefix as key
  if (input[prefix]) {
    return input[prefix];
  }

  // Get all keys and strip the prefix
  const keys = Object.keys(input).map((key) => key.replace(`${prefix}.`, ""));

  // If one of the key starts with a number, we assume it's an array
  const useArray = keys.some((key) => key.match(/^\d+\./));
  if (useArray) {
    const result: any[] = [];
    for (const key of keys) {
      const [index, ikey] = key.split(".", 2) as [number, string];
      if (!result[index]) {
        result[index] = {};
      }
      result[index][ikey] = input[`${prefix}.${index}.${ikey}`];
    }
    return result;
  } else {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = input[`${prefix}.${key}`];
    }
    return result;
  }
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
    return {
      input: convertKeyPathToNestedObject(input, "gen_ai.prompt"),
      output: convertKeyPathToNestedObject(output, "gen_ai.completion"),
    };
  }

  return { input: null, output: null };
};

const extractUserId = (
  attributes: Record<string, unknown>,
): string | undefined => {
  const userIdKeys = ["langfuse.user.id", "user.id"];
  for (const key of userIdKeys) {
    if (attributes[key]) {
      return typeof attributes[key] === "string"
        ? (attributes[key] as string)
        : JSON.stringify(attributes[key]);
    }
  }
};

const extractSessionId = (
  attributes: Record<string, unknown>,
): string | undefined => {
  const userIdKeys = ["langfuse.session.id", "session.id"];
  for (const key of userIdKeys) {
    if (attributes[key]) {
      return typeof attributes[key] === "string"
        ? (attributes[key] as string)
        : JSON.stringify(attributes[key]);
    }
  }
};

const extractModelParameters = (
  attributes: Record<string, unknown>,
): Record<string, unknown> => {
  const modelParameters = Object.keys(attributes).filter((key) =>
    key.startsWith("gen_ai.request."),
  );
  return modelParameters.reduce((acc: any, key) => {
    const modelParamKey = key.replace("gen_ai.request.", "");
    acc[modelParamKey] = attributes[key];
    return acc;
  }, {});
};

const extractModelName = (
  attributes: Record<string, unknown>,
): string | undefined => {
  const modelNameKeys = ["gen_ai.request.model", "gen_ai.response.model"];
  for (const key of modelNameKeys) {
    if (attributes[key]) {
      return typeof attributes[key] === "string"
        ? (attributes[key] as string)
        : JSON.stringify(attributes[key]);
    }
  }
};

const extractUsageDetails = (
  attributes: Record<string, unknown>,
): Record<string, unknown> => {
  const usageDetails = Object.keys(attributes).filter(
    (key) => key.startsWith("gen_ai.usage.") && key !== "gen_ai.usage.cost",
  );
  const usageDetailKeyMapping: Record<string, string> = {
    prompt_tokens: "input",
    completion_tokens: "output",
    total_tokens: "total",
    input_tokens: "input",
    output_tokens: "output",
  };
  return usageDetails.reduce((acc: any, key) => {
    const usageDetailKey = key.replace("gen_ai.usage.", "");
    const mappedUsageDetailKey =
      usageDetailKeyMapping[usageDetailKey] ?? usageDetailKey;
    acc[mappedUsageDetailKey] = attributes[key];
    return acc;
  }, {});
};

const extractCostDetails = (
  attributes: Record<string, unknown>,
): Record<string, unknown> => {
  if (attributes["gen_ai.usage.cost"]) {
    return { total: attributes["gen_ai.usage.cost"] };
  }
  return {};
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
            attributes,
            resourceAttributes,
            scope: scopeSpan?.scope,
          },
          version: resourceAttributes?.["service.version"] ?? null,
          userId: extractUserId(attributes),
          sessionId: extractSessionId(attributes),
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
        modelParameters: extractModelParameters(attributes) as any,
        model: extractModelName(attributes),

        usageDetails: extractUsageDetails(attributes) as any,
        costDetails: extractCostDetails(attributes) as any,

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
