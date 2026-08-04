import { z } from "zod";
import { InAppAgentRateLimitErrorResponseSchema } from "@langfuse/shared/in-app-agent";
import { type InAppAgentError } from "@/src/features/in-app-agent/components/ControlledInAppAgentWindow/fns/getDrawerMessages";

const InAppAgentTransportErrorSchema = z.object({
  message: z.string().optional(),
  payload: z.unknown().optional(),
});

const InAppAgentLegacyErrorPayloadSchema = z.object({
  error: z.string(),
});

export function getInAppAgentError(
  error: unknown,
  now = Date.now(),
): InAppAgentError {
  const parsedError = InAppAgentTransportErrorSchema.safeParse(error);
  const payload = parsedError.success ? parsedError.data.payload : undefined;
  const message = getErrorMessage(error);
  const rateLimitError =
    parseRateLimitError(payload) ??
    parseRateLimitError(error) ??
    parseEmbeddedRateLimitError(message);

  if (rateLimitError) {
    return {
      type: "rate_limit",
      retryAt: now + rateLimitError.details.retryAfterSeconds * 1_000,
    };
  }

  return { type: "generic", message };
}

function parseRateLimitError(value: unknown) {
  const parsed = InAppAgentRateLimitErrorResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseEmbeddedRateLimitError(message: string) {
  const endIndex = message.lastIndexOf("}");
  let startIndex = message.indexOf("{");

  while (startIndex !== -1 && startIndex < endIndex) {
    try {
      const parsed = JSON.parse(
        message.slice(startIndex, endIndex + 1),
      ) as unknown;
      const rateLimitError = parseRateLimitError(parsed);

      if (rateLimitError) {
        return rateLimitError;
      }
    } catch {
      // The transport prefixes JSON with error context, so try the next object.
    }

    startIndex = message.indexOf("{", startIndex + 1);
  }

  return null;
}

function getErrorMessage(error: unknown) {
  const parsedError = InAppAgentTransportErrorSchema.safeParse(error);
  if (!parsedError.success) {
    return "Assistant request failed. Please try again.";
  }

  const legacyPayload = InAppAgentLegacyErrorPayloadSchema.safeParse(
    parsedError.data.payload,
  );
  if (legacyPayload.success) {
    return legacyPayload.data.error;
  }

  return (
    parsedError.data.message ?? "Assistant request failed. Please try again."
  );
}
