import type { InternalTraceEventInput } from "../llm/internalTraceEvents";
import { LangfuseOtelSpanAttributes } from "./attributes";
import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

export const AI_FEATURE_OTEL_SDK_NAME = "langfuse-internal-ai-features";
const AI_FEATURE_OTEL_SCOPE = "langfuse-ai-features-writer";
const AI_FEATURE_SERVICE_NAME = "langfuse-ai-features";

type OtelAttribute = {
  key: string;
  value: { stringValue: string };
};

function stringAttribute(
  key: string,
  value: string | undefined | null,
): OtelAttribute | undefined {
  return value === undefined || value === null
    ? undefined
    : { key, value: { stringValue: value } };
}

function jsonAttribute(key: string, value: unknown): OtelAttribute | undefined {
  if (value === undefined || value === null) return undefined;

  return stringAttribute(key, JSON.stringify(value));
}

function timestampToUnixNano(timestamp: string): string {
  const milliseconds = Date.parse(timestamp);
  if (Number.isNaN(milliseconds)) {
    throw new Error(`Invalid AI-feature trace timestamp: ${timestamp}`);
  }

  return `${BigInt(milliseconds) * 1_000_000n}`;
}

function observationTypeToOtelType(type: string | undefined): string {
  switch (type?.toUpperCase()) {
    case "GENERATION":
      return "generation";
    case "EVENT":
      return "event";
    case "EMBEDDING":
      return "embedding";
    case "AGENT":
      return "agent";
    case "TOOL":
      return "tool";
    case "CHAIN":
      return "chain";
    case "RETRIEVER":
      return "retriever";
    case "GUARDRAIL":
      return "guardrail";
    case "EVALUATOR":
      return "evaluator";
    default:
      return "span";
  }
}

/**
 * `buildInternalTraceEventInputs` treats the SDK `trace-create` event as a
 * span whose id equals the trace id. Legacy ingestion writes that as a trace
 * row, not an observation. Drop it here and unlink children from that phantom
 * parent so in-app agent ids (`arun_*` / `${runId}-trace`) stay intact.
 */
function toObservationInputs(
  eventInputs: InternalTraceEventInput[],
): InternalTraceEventInput[] {
  return eventInputs
    .filter((eventInput) => eventInput.spanId !== eventInput.traceId)
    .map((eventInput) =>
      eventInput.parentSpanId === eventInput.traceId
        ? { ...eventInput, parentSpanId: undefined }
        : eventInput,
    );
}

function aiFeatureTraceInputsToResourceSpans(
  eventInputs: InternalTraceEventInput[],
): ResourceSpan[] {
  const spans = eventInputs.map((eventInput) => {
    const isRoot = !eventInput.parentSpanId;
    const attributes = [
      stringAttribute(
        LangfuseOtelSpanAttributes.ENVIRONMENT,
        eventInput.environment,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        observationTypeToOtelType(eventInput.type),
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        eventInput.level,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE,
        eventInput.statusMessage,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
        eventInput.input,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
        eventInput.output,
      ),
      jsonAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_METADATA,
        eventInput.metadata,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
        eventInput.modelName,
      ),
      jsonAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS,
        eventInput.modelParameters,
      ),
      jsonAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
        eventInput.providedUsageDetails,
      ),
      jsonAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS,
        eventInput.providedCostDetails,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME,
        eventInput.promptName,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION,
        eventInput.promptVersion,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME,
        eventInput.completionStartTime,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.TRACE_USER_ID,
        eventInput.userId,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
        eventInput.sessionId,
      ),
      jsonAttribute(LangfuseOtelSpanAttributes.TRACE_TAGS, eventInput.tags),
      stringAttribute(
        LangfuseOtelSpanAttributes.TRACE_PUBLIC,
        eventInput.public === undefined ? undefined : String(eventInput.public),
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.IS_APP_ROOT,
        isRoot ? "true" : undefined,
      ),
      stringAttribute(LangfuseOtelSpanAttributes.RELEASE, eventInput.release),
      ...(isRoot
        ? [
            stringAttribute(
              LangfuseOtelSpanAttributes.TRACE_NAME,
              eventInput.traceName,
            ),
            stringAttribute(
              LangfuseOtelSpanAttributes.TRACE_INPUT,
              eventInput.input,
            ),
            stringAttribute(
              LangfuseOtelSpanAttributes.TRACE_OUTPUT,
              eventInput.output,
            ),
            jsonAttribute(
              LangfuseOtelSpanAttributes.TRACE_METADATA,
              eventInput.metadata,
            ),
          ]
        : []),
    ].filter((attribute): attribute is OtelAttribute => Boolean(attribute));

    return {
      traceId: eventInput.traceId,
      spanId: eventInput.spanId,
      ...(eventInput.parentSpanId
        ? { parentSpanId: eventInput.parentSpanId }
        : {}),
      name: eventInput.name ?? "span",
      kind: 1,
      startTimeUnixNano: timestampToUnixNano(eventInput.startTimeISO),
      endTimeUnixNano: timestampToUnixNano(eventInput.endTimeISO),
      attributes,
      status: {
        ...(eventInput.level === "ERROR" ? { code: 2 } : {}),
        ...(eventInput.statusMessage
          ? { message: eventInput.statusMessage }
          : {}),
      },
    };
  });

  return [
    {
      resource: {
        attributes: [
          {
            key: "service.name",
            value: { stringValue: AI_FEATURE_SERVICE_NAME },
          },
        ],
      },
      scopeSpans: [
        {
          scope: {
            name: AI_FEATURE_OTEL_SCOPE,
            version: "unknown",
          },
          spans,
        },
      ],
    },
  ] as ResourceSpan[];
}

/**
 * Publishes AI-features product traces (in-app agent, later Ask AI) through
 * the v4 OTel ingestion queue. Unlike `writeInternalTraceViaOtelIngestion`,
 * this preserves Langfuse observation ids that are not W3C span ids and does
 * not require a `langfuse*` environment — product traces use `production` so
 * evaluators in the AI-features project can match them.
 */
export async function publishAiFeatureTraceViaOtelIngestion(params: {
  eventInputs: InternalTraceEventInput[];
  projectId: string;
}): Promise<void> {
  const eventInputs = toObservationInputs(params.eventInputs);
  if (eventInputs.length === 0) return;

  const processor = new OtelIngestionProcessor({
    projectId: params.projectId,
    publicKey: "",
    sdkName: AI_FEATURE_OTEL_SDK_NAME,
    sdkVersion: "unknown",
    ingestionVersion: "4",
    // Product traces must look like customer data: the public schema keeps
    // `production`, and observation evals are allowed to match them.
    isLangfuseInternal: false,
  });

  await processor.publishToOtelIngestionQueue(
    aiFeatureTraceInputsToResourceSpans(eventInputs),
  );
}
