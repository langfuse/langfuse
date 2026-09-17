import { context, trace } from "@opentelemetry/api";

import { LangfuseOtelSpanAttributes } from "../otel/attributes";

/**
 * What a gateway reported one request cost, in USD, keyed by usage type.
 * Ingested as an observation's `costDetails`, where `total` is the whole request.
 */
export type GatewayCost = Record<string, number>;

type GatewayCostAdapter = {
  /** The gateway this reads. */
  id: string;
  fromHeaders: (headers: Headers) => GatewayCost | undefined;
};

/**
 * Structural copy of `CreateSecureFetch` from `./ai-sdk/providers`, kept local
 * so the provider factory can import this module without a cycle.
 */
type CreateFetch = (
  logContext: string,
  additionalSensitiveHeaders?: string[],
) => typeof fetch;

function finiteNumber(raw: string | null): number | undefined {
  if (raw === null) return undefined;

  const trimmed = raw.trim();
  if (trimmed === "") return undefined;

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * LiteLLM reports what it charged on a response header and nowhere else - its
 * non-streaming responses carry no cost in the body at all.
 *
 * Only the total is read. LiteLLM also sends a per-component breakdown
 * (`-input`, `-output`, and others), but those components are present and
 * uniformly `0.0` on a streamed response while the total is absent, so a reader
 * that trusts them records an exact zero for a request that was never priced.
 * The total is the only one of these headers that is either correct or missing.
 */
const litellmAdapter: GatewayCostAdapter = {
  id: "litellm",
  fromHeaders: (headers) => {
    const total = finiteNumber(headers.get("x-litellm-response-cost"));

    // Absence is not zero. A deployment with no configured price omits the
    // header rather than sending `0`, so reporting nothing keeps "unpriced"
    // distinguishable from "free" - a zero here would read as a real result.
    return total === undefined ? undefined : { total };
  },
};

const ADAPTERS: readonly GatewayCostAdapter[] = [litellmAdapter];

/** The first gateway cost any adapter recognises in these headers. */
export function gatewayCostFromHeaders(
  headers: Headers,
): GatewayCost | undefined {
  for (const adapter of ADAPTERS) {
    const cost = adapter.fromHeaders(headers);
    if (cost !== undefined) return cost;
  }

  return undefined;
}

/**
 * Records a gateway-reported cost on the generation span of the call that
 * produced it.
 *
 * The span is the active one because `executeLanguageModelCall` runs the
 * provider call inside it, so the cost reaches the right observation without a
 * correlation key. Nothing else can record it: the AI SDK's completion callback
 * carries usage and provider metadata but no response headers, so a cost that
 * only exists in a header is invisible to every other hook.
 */
function recordGatewayCost(response: Response): void {
  try {
    const cost = gatewayCostFromHeaders(response.headers);
    if (!cost) return;

    const span = trace.getSpan(context.active());
    if (!span) return;

    span.setAttribute(
      LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS,
      JSON.stringify(cost),
    );
  } catch {
    // Telemetry must never fail the completion it describes.
  }
}

/**
 * Wraps a secure-fetch factory so every provider call built from it reports the
 * gateway's own cost, when the gateway sends one.
 *
 * Ingested cost takes precedence over cost inferred from a model definition, so
 * a project that prices its models keeps that behaviour unless its gateway
 * actually returns a figure - at which point the gateway's number wins, which
 * is the point: it knows the negotiated rates, the failover and the discounts
 * that a static price in Langfuse does not.
 */
export function withGatewayCostCapture(createFetch: CreateFetch): CreateFetch {
  return (logContext, additionalSensitiveHeaders) => {
    const innerFetch = createFetch(logContext, additionalSensitiveHeaders);

    return async (input, init) => {
      const response = await innerFetch(input, init);
      recordGatewayCost(response);
      return response;
    };
  };
}
