import { type IngestionEventType } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { ForbiddenError, ObservationLevel } from "@langfuse/shared";
import { LangfuseOtelSpanAttributes } from "./attributes";

export const convertNanoTimestampToISO = (
  timestamp:
    | number
    | string
    | {
        high: number;
        low: number;
      },
) => {
  if (typeof timestamp === "string") {
    return new Date(Number(BigInt(timestamp) / BigInt(1e6))).toISOString();
  }
  if (typeof timestamp === "number") {
    return new Date(timestamp / 1e6).toISOString();
  }

  // Convert high and low to BigInt
  const highBits = BigInt(timestamp.high) << BigInt(32);
  const lowBits = BigInt(timestamp.low >>> 0);

  // Combine high and low bits
  const nanosBigInt = highBits | lowBits;

  // Convert nanoseconds to milliseconds for JavaScript Date
  const millisBigInt = nanosBigInt / BigInt(1000000);
  return new Date(Number(millisBigInt)).toISOString();
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
  domain?: "trace" | "observation",
): { input: any; output: any } => {
  let input = null;
  let output = null;

  // Langfuse
  input =
    domain === "trace" && attributes[LangfuseOtelSpanAttributes.TRACE_INPUT]
      ? attributes[LangfuseOtelSpanAttributes.TRACE_INPUT]
      : attributes[LangfuseOtelSpanAttributes.OBSERVATION_INPUT];
  output =
    domain === "trace" && attributes[LangfuseOtelSpanAttributes.TRACE_OUTPUT]
      ? attributes[LangfuseOtelSpanAttributes.TRACE_OUTPUT]
      : attributes[LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT];

  if (input != null || output != null) {
    return { input, output };
  }

  const inputEvents = events.filter(
    (event: Record<string, unknown>) =>
      event.name === "gen_ai.system.message" ||
      event.name === "gen_ai.user.message" ||
      event.name === "gen_ai.assistant.message" ||
      event.name === "gen_ai.tool.message",
  );

  const outputEvents = events.filter(
    (event: Record<string, unknown>) => event.name === "gen_ai.choice",
  );

  if (inputEvents.length > 0 || outputEvents.length > 0) {
    // Convert events to a structured format
    const processedInput =
      inputEvents.length > 0
        ? inputEvents.map((event: any) => {
            const eventAttributes =
              event.attributes?.reduce((acc: any, attr: any) => {
                acc[attr.key] = convertValueToPlainJavascript(attr.value);
                return acc;
              }, {}) ?? {};

            return {
              role: event.name.replace("gen_ai.", "").replace(".message", ""),
              ...eventAttributes,
            };
          })
        : null;

    const processedOutput =
      outputEvents.length > 0
        ? outputEvents.map((event: any) => {
            const eventAttributes =
              event.attributes?.reduce((acc: any, attr: any) => {
                acc[attr.key] = convertValueToPlainJavascript(attr.value);
                return acc;
              }, {}) ?? {};

            return eventAttributes;
          })
        : null;

    return {
      input: processedInput,
      output:
        processedOutput && processedOutput.length === 1
          ? processedOutput[0]
          : processedOutput,
    };
  }

  // Check legacy semantic kernel event definitions
  input = events.find(
    (event: Record<string, unknown>) => event.name === "gen_ai.content.prompt",
  )?.attributes;

  output = events.find(
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

  // Google Vertex AI Agent-Developer-Kit (ADK)
  input = attributes["gcp.vertex.agent.llm_request"];
  output = attributes["gcp.vertex.agent.llm_response"];
  if (input || output) {
    return {
      input: input,
      output: output,
    };
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

  // Pydantic and Pipecat uses input and output
  input = attributes["input"];
  output = attributes["output"];
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
    LangfuseOtelSpanAttributes.ENVIRONMENT,
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

const extractMetadata = (
  attributes: Record<string, unknown>,
  domain: "trace" | "observation",
): Record<string, unknown> => {
  // Extract top-level metadata object if available
  let metadata: Record<string, unknown> = {};

  const metadataKeyPrefix =
    domain === "observation"
      ? LangfuseOtelSpanAttributes.OBSERVATION_METADATA
      : LangfuseOtelSpanAttributes.TRACE_METADATA;

  const langfuseMetadataAttribute =
    attributes[metadataKeyPrefix] || attributes["langfuse.metadata"];

  if (langfuseMetadataAttribute) {
    try {
      // If it's a string (JSON), parse it
      if (typeof langfuseMetadataAttribute === "string") {
        metadata = JSON.parse(langfuseMetadataAttribute as string);
      }
      // If it's already an object, use it
      else if (typeof langfuseMetadataAttribute === "object") {
        metadata = langfuseMetadataAttribute as Record<string, unknown>;
      }
    } catch (e) {
      // If parsing fails, continue with nested metadata extraction
    }
  }

  // Extract metadata from langfuse.metadata.* keys
  const langfuseMetadata: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(attributes)) {
    for (const prefix of [metadataKeyPrefix, "langfuse.metadata"]) {
      if (key.startsWith(`${prefix}.`)) {
        const newKey = key.replace(`${prefix}.`, "");
        langfuseMetadata[newKey] = value;
      }
    }
  }

  return {
    ...metadata,
    ...langfuseMetadata,
  };
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
  // Langfuse
  if (attributes[LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS]) {
    try {
      return JSON.parse(
        attributes[
          LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS
        ] as string,
      );
    } catch {}
  }

  // If we get invocation parameters, we use them as they are
  if (attributes["llm.invocation_parameters"]) {
    try {
      return JSON.parse(attributes["llm.invocation_parameters"] as string);
    } catch (e) {
      // fallthrough
    }
  }

  if (attributes["model_config"]) {
    try {
      return JSON.parse(attributes["model_config"] as string);
    } catch (e) {
      // fallthrough
    }
  }

  const modelParameters = Object.keys(attributes).filter((key) =>
    key.startsWith("gen_ai.request."),
  );

  return modelParameters.reduce((acc: any, key) => {
    const modelParamKey = key.replace("gen_ai.request.", "");
    // avoid double-reporting the model name, already included in native model attribute
    if (modelParamKey !== "model") {
      acc[modelParamKey] = attributes[key];
    }
    return acc;
  }, {});
};

const extractModelName = (
  attributes: Record<string, unknown>,
): string | undefined => {
  const modelNameKeys = [
    LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
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
  isLangfuseSDKSpan: boolean,
): Record<string, unknown> => {
  if (isLangfuseSDKSpan) {
    try {
      return JSON.parse(
        attributes[
          LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS
        ] as string,
      );
    } catch {}
  }

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
  isLangfuseSDKSpan: boolean,
): Record<string, unknown> => {
  if (isLangfuseSDKSpan) {
    try {
      return JSON.parse(
        attributes[
          LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS
        ] as string,
      );
    } catch {}
  }

  if (attributes["gen_ai.usage.cost"]) {
    return { total: attributes["gen_ai.usage.cost"] };
  }
  return {};
};

const extractCompletionStartTime = (attributes: Record<string, unknown>) => {
  try {
    return JSON.parse(
      attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME
      ] as string,
    );
  } catch {}

  return null;
};

const extractTags = (attributes: Record<string, unknown>): string[] => {
  const tagsValue =
    attributes[LangfuseOtelSpanAttributes.TRACE_TAGS] ||
    attributes["langfuse.tags"];

  // If no tags, return empty array
  if (tagsValue === undefined || tagsValue === null) {
    return [];
  }

  // If already an array (converted by convertValueToPlainJavascript)
  if (Array.isArray(tagsValue)) {
    return tagsValue.map((tag) => String(tag));
  }

  // If JSON string array
  if (typeof tagsValue === "string" && tagsValue.trim().startsWith("[")) {
    try {
      const parsedTags = JSON.parse(tagsValue);
      if (Array.isArray(parsedTags)) {
        return parsedTags.map((tag) => String(tag));
      }
    } catch (e) {
      // If parsing fails, continue with other methods
    }
  }

  // If CSV string
  if (typeof tagsValue === "string" && tagsValue.includes(",")) {
    return tagsValue.split(",").map((tag) => tag.trim());
  }

  // If single string value
  if (typeof tagsValue === "string") {
    return [tagsValue];
  }

  // Fallback to empty array
  return [];
};

/**
 * Accepts an OpenTelemetry resourceSpan from a ExportTraceServiceRequest and
 * returns a list of Langfuse events.
 * We use a list type here, because a root span should create a trace, i.e. we
 * may have a 1:N case.
 */
export const convertOtelSpanToIngestionEvent = (
  resourceSpan: any,
  publicKey?: string,
): IngestionEventType[] => {
  const resourceAttributes =
    resourceSpan?.resource?.attributes?.reduce((acc: any, attr: any) => {
      acc[attr.key] = convertValueToPlainJavascript(attr.value);
      return acc;
    }, {}) ?? {};

  const events: IngestionEventType[] = [];

  for (const scopeSpan of resourceSpan?.scopeSpans ?? []) {
    const isLangfuseSDKSpans = scopeSpan.scope?.name.startsWith("langfuse-sdk");

    const scopeAttributes =
      scopeSpan?.scope?.attributes?.reduce((acc: any, attr: any) => {
        acc[attr.key] = convertValueToPlainJavascript(attr.value);
        return acc;
      }, {}) ?? {};

    if (
      isLangfuseSDKSpans &&
      (!publicKey ||
        (scopeAttributes["public_key"] as unknown as string) !== publicKey)
    ) {
      throw new ForbiddenError(
        `Langfuse OTEL SDK span has different public key '${scopeAttributes["public_key"]}' than used for authentication '${publicKey}'. Discarding span.`,
      );
    }

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

      const spanAttributeMetadata = extractMetadata(attributes, "observation");
      const resourceAttributeMetadata = extractMetadata(
        resourceAttributes,
        "trace",
      );
      const startTimeISO = convertNanoTimestampToISO(span.startTimeUnixNano);
      const endTimeISO = convertNanoTimestampToISO(span.endTimeUnixNano);
      const is_root_span =
        !parentObservationId ||
        String(attributes[LangfuseOtelSpanAttributes.AS_ROOT]) === "true";

      const spanAttributesInMetadata = Object.fromEntries(
        Object.entries(attributes).map(([key, value]) => [
          key,
          typeof value === "string" ? value : JSON.stringify(value),
        ]),
      );

      const hasTraceUpdates = [
        LangfuseOtelSpanAttributes.TRACE_NAME,
        LangfuseOtelSpanAttributes.TRACE_INPUT,
        LangfuseOtelSpanAttributes.TRACE_OUTPUT,
        LangfuseOtelSpanAttributes.TRACE_METADATA,
        LangfuseOtelSpanAttributes.TRACE_USER_ID,
        LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
        LangfuseOtelSpanAttributes.TRACE_PUBLIC,
        LangfuseOtelSpanAttributes.TRACE_TAGS,
      ].some((traceAttribute) => Boolean(attributes[traceAttribute]));

      if (is_root_span || hasTraceUpdates) {
        // Create a trace for any root span
        const trace = {
          id: Buffer.from(span.traceId?.data ?? span.traceId).toString("hex"),
          timestamp: startTimeISO,
          name:
            attributes[LangfuseOtelSpanAttributes.TRACE_NAME] ??
            (!parentObservationId
              ? extractName(span.name, attributes)
              : undefined),
          metadata: {
            ...resourceAttributeMetadata,
            ...extractMetadata(attributes, "trace"),
            ...(isLangfuseSDKSpans
              ? {}
              : { attributes: spanAttributesInMetadata }),
            resourceAttributes,
            scope: { ...(scopeSpan.scope || {}), attributes: scopeAttributes },
          },
          version:
            attributes?.[LangfuseOtelSpanAttributes.VERSION] ??
            resourceAttributes?.["service.version"] ??
            null,
          release:
            attributes?.[LangfuseOtelSpanAttributes.RELEASE] ??
            resourceAttributes?.[LangfuseOtelSpanAttributes.RELEASE] ??
            null,
          userId: extractUserId(attributes),
          sessionId: extractSessionId(attributes),
          public:
            attributes?.[LangfuseOtelSpanAttributes.TRACE_PUBLIC] === true ||
            attributes?.[LangfuseOtelSpanAttributes.TRACE_PUBLIC] === "true" ||
            attributes?.["langfuse.public"] === true ||
            attributes?.["langfuse.public"] === "true",
          tags: extractTags(attributes),

          environment: extractEnvironment(attributes, resourceAttributes),

          // Input and Output
          ...extractInputAndOutput(span?.events ?? [], attributes, "trace"),
        };
        events.push({
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date(startTimeISO).toISOString(),
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
        startTime: startTimeISO,
        endTime: endTimeISO,

        environment: extractEnvironment(attributes, resourceAttributes),

        // Additional fields
        completionStartTime: extractCompletionStartTime(attributes),
        metadata: {
          ...resourceAttributeMetadata,
          ...spanAttributeMetadata,
          ...(isLangfuseSDKSpans
            ? {}
            : { attributes: spanAttributesInMetadata }),
          resourceAttributes,
          scope: { ...scopeSpan.scope, attributes: scopeAttributes },
        },
        level:
          attributes[LangfuseOtelSpanAttributes.OBSERVATION_LEVEL] ??
          (span.status?.code === 2
            ? ObservationLevel.ERROR
            : ObservationLevel.DEFAULT),
        statusMessage:
          attributes[LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE] ??
          span.status?.message ??
          null,
        version:
          attributes[LangfuseOtelSpanAttributes.VERSION] ??
          resourceAttributes?.["service.version"] ??
          null,
        modelParameters: extractModelParameters(attributes) as any,
        model: extractModelName(attributes),

        promptName:
          attributes?.[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME] ??
          attributes["langfuse.prompt.name"] ??
          null,
        promptVersion:
          attributes?.[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION] ??
          attributes["langfuse.prompt.version"] ??
          null,

        usageDetails: extractUsageDetails(
          attributes,
          isLangfuseSDKSpans,
        ) as any,
        costDetails: extractCostDetails(attributes, isLangfuseSDKSpans) as any,

        // Input and Output
        ...extractInputAndOutput(span?.events ?? [], attributes),
      };

      // If the span has a model property, we consider it a generation.
      // Just checking for llm.* or gen_ai.* attributes leads to overreporting and wrong
      // aggregations for costs.
      const isGeneration =
        attributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE] ===
          "generation" ||
        Boolean(observation.model) ||
        ("openinference.span.kind" in attributes &&
          attributes["openinference.span.kind"] === "LLM");

      const isEvent =
        attributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE] === "event";

      events.push({
        id: randomUUID(),
        type: isGeneration
          ? "generation-create"
          : isEvent
            ? "event-create"
            : "span-create",
        timestamp: new Date().toISOString(),
        body: observation,
      });
    }
  }

  return events;
};
