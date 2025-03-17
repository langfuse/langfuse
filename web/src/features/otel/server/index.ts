import { type IngestionEventType } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { ObservationLevel } from "@langfuse/shared";

const convertNanoTimestampToISO = (
  timestamp:
    | number
    | string
    | {
        high: number;
        low: number;
      },
) => {
  if (typeof timestamp === "string") {
    return new Date(parseInt(timestamp, 10) / 1e6).toISOString();
  }
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
    input =
      input?.reduce((acc: any, attr: any) => {
        acc[attr.key] = convertValueToPlainJavascript(attr.value);
        return acc;
      }, {}) ?? {};
    output =
      output?.reduce((acc: any, attr: any) => {
        acc[attr.key] = convertValueToPlainJavascript(attr.value);
        return acc;
      }, {}) ?? {};
    // Here, we are interested in the attributes of the event. Usually gen_ai.prompt and gen_ai.completion.
    // We can use the current function again to extract them from the event attributes.
    const { input: eventInput } = extractInputAndOutput([], input);
    const { output: eventOutput } = extractInputAndOutput([], output);
    return { input: eventInput || input, output: eventOutput || output };
  }

  // Logfire uses `prompt` and `all_messages_events` property on spans
  input = attributes["prompt"];
  output = attributes["all_messages_events"];
  if (input || output) {
    return { input, output };
  }

  // Logfire uses single `events` array for GenAI events.
  const eventsArray = attributes["events"];
  if (typeof eventsArray === "string" || Array.isArray(eventsArray)) {
    let events = eventsArray as any[];
    if (typeof eventsArray === "string") {
      try {
        events = JSON.parse(eventsArray);
      } catch (e) {
        // fallthrough
        events = [];
      }
    }

    // Find the gen_ai.choice event for output
    const choiceEvent = events.find(
      (event) => event["event.name"] === "gen_ai.choice",
    );
    // All other events are considered input
    const inputEvents = events.filter(
      (event) => event["event.name"] !== "gen_ai.choice",
    );

    if (choiceEvent || inputEvents.length > 0) {
      return {
        input: inputEvents.length > 0 ? inputEvents : null,
        output: choiceEvent || null,
      };
    }
  }

  // MLFlow sets mlflow.spanInputs and mlflow.spanOutputs
  input = attributes["mlflow.spanInputs"];
  output = attributes["mlflow.spanOutputs"];
  if (input || output) {
    return { input, output };
  }

  // TraceLoop sets traceloop.entity.input and traceloop.entity.output
  input = attributes["traceloop.entity.input"];
  output = attributes["traceloop.entity.output"];
  if (input || output) {
    return { input, output };
  }

  // SmolAgents sets input.value and output.value
  input = attributes["input.value"];
  output = attributes["output.value"];
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

const extractEnvironment = (
  attributes: Record<string, unknown>,
  resourceAttributes: Record<string, unknown>,
): string => {
  const environmentAttributeKeys = [
    "langfuse.environment",
    "deployment.environment.name",
    "deployment.environment",
  ];
  for (const key of environmentAttributeKeys) {
    if (resourceAttributes[key]) {
      return resourceAttributes[key] as string;
    }
    if (attributes[key]) {
      return attributes[key] as string;
    }
  }
  return "default";
};

const extractName = (
  spanName: string,
  attributes: Record<string, unknown>,
): string => {
  const nameKeys = ["logfire.msg"];
  for (const key of nameKeys) {
    if (attributes[key]) {
      return typeof attributes[key] === "string"
        ? (attributes[key] as string)
        : JSON.stringify(attributes[key]);
    }
  }
  return spanName;
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
  // If we get invocation parameters, we use them as they are
  if (attributes["llm.invocation_parameters"]) {
    try {
      return JSON.parse(attributes["llm.invocation_parameters"] as string);
    } catch (e) {
      // fallthrough
    }
  }

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
  const modelNameKeys = [
    "gen_ai.request.model",
    "gen_ai.response.model",
    "llm.model_name",
    "model",
  ];
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
    (key) =>
      (key.startsWith("gen_ai.usage.") && key !== "gen_ai.usage.cost") ||
      key.startsWith("llm.token_count"),
  );
  const usageDetailKeyMapping: Record<string, string> = {
    prompt_tokens: "input",
    completion_tokens: "output",
    total_tokens: "total",
    input_tokens: "input",
    output_tokens: "output",
    prompt: "input",
    completion: "output",
  };
  return usageDetails.reduce((acc: any, key) => {
    const usageDetailKey = key
      .replace("gen_ai.usage.", "")
      .replace("llm.token_count.", "");
    const mappedUsageDetailKey =
      usageDetailKeyMapping[usageDetailKey] ?? usageDetailKey;
    // Cast the respective key to a number
    const value = Number(attributes[key]);
    if (!Number.isNaN(value)) {
      acc[mappedUsageDetailKey] = value;
    }
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

      const parentObservationId = span?.parentSpanId
        ? Buffer.from(span.parentSpanId?.data ?? span.parentSpanId).toString(
            "hex",
          )
        : null;

      if (!parentObservationId) {
        // Create a trace for any root span
        const trace = {
          id: Buffer.from(span.traceId?.data ?? span.traceId).toString("hex"),
          timestamp: convertNanoTimestampToISO(span.startTimeUnixNano),
          name: extractName(span.name, attributes),
          metadata: {
            attributes,
            resourceAttributes,
            scope: scopeSpan?.scope,
          },
          version:
            attributes?.["langfuse.version"] ??
            resourceAttributes?.["service.version"] ??
            null,
          release: attributes?.["langfuse.release"] ?? null,
          userId: extractUserId(attributes),
          sessionId: extractSessionId(attributes),
          public:
            attributes?.["langfuse.public"] === true ||
            attributes?.["langfuse.public"] === "true",
          tags: attributes?.["langfuse.tags"] ?? [],

          environment: extractEnvironment(attributes, resourceAttributes),

          // Input and Output
          ...extractInputAndOutput(span?.events ?? [], attributes),
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
        parentObservationId,
        name: extractName(span.name, attributes),
        startTime: convertNanoTimestampToISO(span.startTimeUnixNano),
        endTime: convertNanoTimestampToISO(span.endTimeUnixNano),

        environment: extractEnvironment(attributes, resourceAttributes),

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
        statusMessage: span.status?.message ?? null,
        version:
          attributes?.["langfuse.version"] ??
          resourceAttributes?.["service.version"] ??
          null,
        modelParameters: extractModelParameters(attributes) as any,
        model: extractModelName(attributes),

        promptName: attributes?.["langfuse.prompt.name"] ?? null,
        promptVersion: attributes?.["langfuse.prompt.version"] ?? null,

        usageDetails: extractUsageDetails(attributes) as any,
        costDetails: extractCostDetails(attributes) as any,

        // Input and Output
        ...extractInputAndOutput(span?.events ?? [], attributes),
      };

      // If the span has a model property, we consider it a generation.
      // Just checking for llm.* or gen_ai.* attributes leads to overreporting and wrong
      // aggregations for costs.
      const isGeneration =
        Boolean(observation.model) ||
        ("openinference.span.kind" in attributes &&
          attributes["openinference.span.kind"] === "LLM");
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
