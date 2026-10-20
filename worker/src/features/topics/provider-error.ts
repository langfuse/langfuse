import {
  TOPICS_MODEL_SLOT_DETAILS,
  type TopicsModelSlotName,
} from "@langfuse/shared/topics";
import { EvaluatorBlockReason } from "@prisma/client";
import { z } from "zod";
import { getLLMErrorInfo, logger } from "@langfuse/shared/src/server";
import {
  getTopicTextResponseMetadata,
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
  | "content_filter"
  | "invalid_input"
  | "provider_error";

/** Telemetry only; the user-facing message stays generic. */
export type TopicProviderErrorDetails = {
  httpStatus?: number;
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
  if (
    contentFilterErrorSchema.safeParse(
      getLLMErrorInfo(error)?.providerError?.data,
    ).success ||
    getTopicTextResponseMetadata(error)?.[
      "langfuse.topics.response.finish_reason"
    ] === "content-filter"
  )
    return new TopicsProviderUnavailable(
      `${subject} declined the request because of its content filter. You can retry or choose another model.`,
      "content_filter",
      model.slot,
      providerErrorDetails(error, status),
    );
  const failed = `${subject} failed${status ? ` (HTTP ${status})` : ""}.`;
  // The message names the actual failure; a generic credentials hint misleads for output or rate-limit errors.
  const message = {
    authentication: `${failed} Check the connection's credentials and billing.`,
    invalid_input: `${failed} The provider rejected the request; check that the model ID supports it.`,
    rate_limit: `${failed} The provider rate-limited the request. Try again later.`,
    timeout: `${failed} The request timed out. Try again later.`,
    invalid_output: `${subject} returned no usable structured output. Resume interrupted stages to retry, or choose another model.`,
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

const contentFilterErrorSchema = z.object({
  error: z.object({ code: z.literal("content_filter") }),
});

/** Provider error strings can echo request/response content; retain only status. */
function providerErrorDetails(
  error: unknown,
  status: number | undefined,
): TopicProviderErrorDetails {
  const provider = getLLMErrorInfo(error)?.providerError;
  const httpStatus = provider?.statusCode ?? status;
  return httpStatus ? { httpStatus } : {};
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
