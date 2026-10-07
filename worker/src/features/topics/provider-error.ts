type TopicsProviderErrorReason =
  | "authentication"
  | "rate_limit"
  | "timeout"
  | "invalid_output"
  | "invalid_input"
  | "provider_error";

export class TopicsProviderUnavailable extends Error {
  constructor(
    message: string,
    readonly reason: TopicsProviderErrorReason = "provider_error",
  ) {
    super(message);
  }
}

/** Provider bodies and exception messages can echo credentials or trace content. */
export function topicProviderError(error: unknown): TopicsProviderUnavailable {
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
      if (status === 401 || status === 403) reason = "authentication";
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
    `Topics provider call failed${status ? ` (HTTP ${status})` : ""}. Processing stopped. Check worker credentials or provider availability, then resume the execution.`,
    reason,
  );
}
