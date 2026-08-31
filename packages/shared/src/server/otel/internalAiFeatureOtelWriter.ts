import type { InternalTraceEventInput } from "../llm/internalTraceEvents";
import { type ResourceSpan } from "./OtelIngestionProcessor";
import { AI_FEATURE_OTEL_SDK_NAME } from "./attributes";
import {
  internalTraceEventToOtelAttributes,
  publishOtelResourceSpans,
} from "./internalTraceOtelWriter";

const AI_FEATURE_OTEL_SCOPE = "langfuse-ai-features-writer";
const AI_FEATURE_SERVICE_NAME = "langfuse-ai-features";

type OtelAttribute = {
  key: string;
  value: { stringValue: string };
};

function timestampToUnixNano(timestamp: string): string {
  const milliseconds = Date.parse(timestamp);
  if (Number.isNaN(milliseconds)) {
    throw new Error(`Invalid AI-feature trace timestamp: ${timestamp}`);
  }

  return `${BigInt(milliseconds) * 1_000_000n}`;
}

function attributesToOtelList(
  attributes: ReturnType<typeof internalTraceEventToOtelAttributes>,
): OtelAttribute[] {
  return Object.entries(attributes)
    .map(([key, value]) => {
      if (value === undefined || value === null) return undefined;
      return {
        key,
        value: {
          stringValue:
            typeof value === "string" ? value : JSON.stringify(value),
        },
      };
    })
    .filter((attribute): attribute is OtelAttribute => Boolean(attribute));
}

/**
 * Keep the SDK `trace-create` span (id === trace id). Legacy ingestion stored
 * that as a TRACE row; event propagation then materializes it as the wrapping
 * `t-{traceId}` SPAN with conversation input/output. Emitting it here gives
 * OTel-native assistant traces the same root span above the AGENT turn.
 */
function aiFeatureTraceInputsToResourceSpans(
  eventInputs: InternalTraceEventInput[],
): ResourceSpan[] {
  const spans = eventInputs.map((eventInput) => {
    const isRoot = !eventInput.parentSpanId;

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
      attributes: attributesToOtelList(
        internalTraceEventToOtelAttributes(eventInput, { isRoot }),
      ),
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
 * Publishes AI-features product traces through the same OTel ingestion queue
 * as `writeInternalTraceViaOtelIngestion`. Span construction stays here so
 * non-W3C ids (`arun_*`, `${runId}-llm-N`) and `production` survive; attribute
 * names and observation types come from `internalTraceEventToOtelAttributes`.
 */
export async function publishAiFeatureTraceViaOtelIngestion(params: {
  eventInputs: InternalTraceEventInput[];
  projectId: string;
}): Promise<void> {
  if (params.eventInputs.length === 0) return;

  await publishOtelResourceSpans({
    resourceSpans: aiFeatureTraceInputsToResourceSpans(params.eventInputs),
    projectId: params.projectId,
    sdkName: AI_FEATURE_OTEL_SDK_NAME,
    ingestionVersion: "4",
    // Product traces must look like customer data: the public schema keeps
    // `production`, and observation evals are allowed to match them.
    isLangfuseInternal: false,
  });
}
