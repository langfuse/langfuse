import {
  TOPICS_MODEL_SLOT_DETAILS,
  type TopicsModelSlotName,
} from "@langfuse/shared/topics";
import { EvaluatorBlockReason } from "@prisma/client";
import { getLLMErrorInfo, logger } from "@langfuse/shared/src/server";
import {
  pauseTopicsModels,
  type TopicsModel,
} from "@langfuse/shared/topics/server";

type TopicsProviderErrorReason =
  | "authentication"
  // The project's saved models are missing or differ from a frozen request.
  | "configuration"
  | "rate_limit"
  | "timeout"
  | "invalid_output"
  | "invalid_input"
  | "provider_error";

/** Telemetry only; the user-facing message stays generic. */
export type TopicProviderErrorDetails = {
  httpStatus?: number;
  // Why a model returned no usable output; never the output itself.
  finishReason?: string;
  rawFinishReason?: string;
  message?: string;
  type?: string;
  code?: string;
  param?: string;
};

export class TopicsProviderUnavailable extends Error {
  constructor(
    message: string,
    readonly reason: TopicsProviderErrorReason = "provider_error",
    readonly slot?: TopicsModelSlotName,
    readonly details: TopicProviderErrorDetails = {},
  ) {
    super(message);
  }
}

/** Provider bodies and exception messages can echo credentials or trace content. */
export function topicProviderError(
  error: unknown,
  model: Pick<TopicsModel, "slot" | "provider" | "model">,
): TopicsProviderUnavailable {
  let current = error;
  let status: number | undefined;
  let reason: TopicsProviderErrorReason = "provider_error";
  for (
    let depth = 0;
    depth < 4 && current && typeof current === "object";
    depth++
  ) {
    const record = current as Record<string, unknown>;
    const candidate = record.statusCode ?? record.status;
    if (typeof candidate === "number" && candidate >= 400 && candidate <= 599) {
      status = candidate;
      if (status === 401 || status === 402 || status === 403)
        reason = "authentication";
      else if (status === 400 || status === 413 || status === 422)
        reason = "invalid_input";
      else if (status === 429) reason = "rate_limit";
      else if (status === 408 || status === 504) reason = "timeout";
      else reason = "provider_error";
      break;
    }
    if (record.name === "AbortError" || record.name === "TimeoutError")
      reason = "timeout";
    if (record.name === "CredentialsProviderError") reason = "authentication";
    if (
      record.name === "AI_NoObjectGeneratedError" ||
      record.name === "AI_NoOutputGeneratedError" ||
      record.name === "AI_TypeValidationError" ||
      record.name === "AI_JSONParseError" ||
      record.name === "SyntaxError" ||
      record.name === "ZodError"
    )
      reason = "invalid_output";
    current = record.cause;
  }
  const subject = `The ${TOPICS_MODEL_SLOT_DETAILS[model.slot].label.toLowerCase()} model ${model.model} on LLM connection "${model.provider}"`;
  const failed = `${subject} failed${status ? ` (HTTP ${status})` : ""}.`;
  // The message names the actual failure; a generic credentials hint misleads for output or rate-limit errors.
  const message = {
    authentication: `${failed} Check the connection's credentials and billing.`,
    invalid_input: `${failed} The provider rejected the request; check that the model ID supports it.`,
    rate_limit: `${failed} The provider rate-limited the request. Try again later.`,
    timeout: `${failed} The request timed out. Try again later.`,
    invalid_output: `${subject} returned no usable output.`,
    configuration: `${failed} Check the Topics model settings.`,
    provider_error: `${failed} Check the model ID and provider availability.`,
  }[reason];
  return new TopicsProviderUnavailable(
    message,
    reason,
    model.slot,
    providerErrorDetails(error, status),
  );
}

/**
 * Like evals, keeps only the AI SDK's parsed provider error fields; plain errors
 * (e.g. the direct Bedrock call) carry the response body, so they keep the status only.
 */
function providerErrorDetails(
  error: unknown,
  status: number | undefined,
): TopicProviderErrorDetails {
  const record = (value: unknown) =>
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : undefined;
  const text = (value: unknown) =>
    typeof value === "string" ? value.slice(0, 500) : undefined;
  const reasons = finishReasons(error);
  const provider = getLLMErrorInfo(error)?.providerError;
  const httpStatus = provider?.statusCode ?? status;
  if (!httpStatus) return reasons;
  if (!provider) return { ...reasons, httpStatus };
  const data = record(record(provider.data)?.error) ?? record(provider.data);
  return {
    ...reasons,
    httpStatus,
    message: text(provider.message),
    type: text(data?.type),
    code: text(data?.code),
    param: text(data?.param),
  };
}

/** The provider rejected the connection's credentials or billing. */
export function isRejectedConnection(
  error: unknown,
): error is TopicsProviderUnavailable {
  return (
    error instanceof TopicsProviderUnavailable &&
    error.reason === "authentication"
  );
}

function rejectedConnectionBlock(error: TopicsProviderUnavailable) {
  return {
    blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
    blockMessage: `${error.message} Automatic processing was paused. Fix the connection, then turn automatic processing back on.`,
  };
}

/** Turns automatic processing off; a failed write is logged, not rethrown. */
export async function pauseForRejectedConnection(
  projectId: string,
  error: TopicsProviderUnavailable,
): Promise<void> {
  try {
    await pauseTopicsModels(projectId, rejectedConnectionBlock(error));
  } catch (pauseError) {
    logger.error("Failed to pause Topics after a rejected connection", {
      projectId,
      error:
        pauseError instanceof Error ? pauseError.message : String(pauseError),
    });
  }
}

/** Finish reasons are provider enums; anything else could be model text. */
function finishReasons(
  error: unknown,
): Pick<TopicProviderErrorDetails, "finishReason" | "rawFinishReason"> {
  const record = (value: unknown) =>
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : undefined;
  const enumValue = (value: unknown) =>
    typeof value === "string" && /^[\w-]{1,40}$/.test(value)
      ? value
      : undefined;
  for (let current = record(error), depth = 0; current && depth < 4; depth++) {
    if (typeof current.finishReason === "string")
      return {
        finishReason: enumValue(current.finishReason),
        rawFinishReason: enumValue(current.rawFinishReason),
      };
    current = record(current.cause);
  }
  return {};
}
