import {
  TOPICS_MODEL_SLOT_DETAILS,
  type TopicsModelSlotName,
} from "@langfuse/shared/topics";
import { EvaluatorBlockReason } from "@prisma/client";
import { logger } from "@langfuse/shared/src/server";
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

export class TopicsProviderUnavailable extends Error {
  constructor(
    message: string,
    readonly reason: TopicsProviderErrorReason = "provider_error",
    readonly slot?: TopicsModelSlotName,
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
      record.name === "ZodError"
    )
      reason = "invalid_output";
    current = record.cause;
  }
  return new TopicsProviderUnavailable(
    `The ${TOPICS_MODEL_SLOT_DETAILS[model.slot].label.toLowerCase()} model ${model.model} on LLM connection "${model.provider}" failed${status ? ` (HTTP ${status})` : ""}. Check the connection's credentials, the model ID, and provider availability.`,
    reason,
    model.slot,
  );
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
    blockMessage: `${error.message} Topics was turned off; fix the connection and turn it on again.`,
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
