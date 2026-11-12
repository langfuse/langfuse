import { describe, expect, it } from "vitest";
import { OAuth2TokenError, RetryError } from "@langfuse/shared/src/server";

import { isRejectedConnection, topicProviderError } from "./provider-error";

const model = {
  slot: "summary" as const,
  provider: "openai-oauth2",
  model: "gpt-4o-mini",
};

describe("topicProviderError", () => {
  it("maps a credential OAuth2TokenError to the pausing authentication reason", () => {
    const error = topicProviderError(
      new OAuth2TokenError(
        "credential",
        "OAuth2 token endpoint returned 401: invalid_client",
      ),
      model,
    );

    expect(error.reason).toBe("authentication");
    expect(isRejectedConnection(error)).toBe(true);
  });

  it("maps a config OAuth2TokenError to the pausing authentication reason", () => {
    const error = topicProviderError(
      new OAuth2TokenError("config", "Invalid OAuth2 connection config"),
      model,
    );

    expect(error.reason).toBe("authentication");
    expect(isRejectedConnection(error)).toBe(true);
  });

  it("maps a disabled OAuth2TokenError to the non-pausing provider_error reason", () => {
    const error = topicProviderError(
      new OAuth2TokenError(
        "disabled",
        "OAuth2 client credentials are disabled: set LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS",
      ),
      model,
    );

    expect(error.reason).toBe("provider_error");
    expect(isRejectedConnection(error)).toBe(false);
  });

  it("maps an unavailable OAuth2TokenError to the non-pausing provider_error reason", () => {
    const error = topicProviderError(
      new OAuth2TokenError(
        "unavailable",
        "OAuth2 token endpoint unavailable after 3 attempts: 503",
      ),
      model,
    );

    expect(error.reason).toBe("provider_error");
    expect(isRejectedConnection(error)).toBe(false);
  });

  it("maps a credential OAuth2TokenError wrapped by the AI SDK the same way", () => {
    const oauth2Error = new OAuth2TokenError(
      "credential",
      "OAuth2 token endpoint returned 401: invalid_client",
    );
    const wrapped = new Error("fetch failed", { cause: oauth2Error });

    const error = topicProviderError(wrapped, model);

    expect(error.reason).toBe("authentication");
    expect(isRejectedConnection(error)).toBe(true);
  });

  it("maps a credential OAuth2TokenError wrapped in a RetryError the same way", () => {
    const oauth2Error = new OAuth2TokenError(
      "credential",
      "OAuth2 token endpoint returned 401: invalid_client",
    );
    const wrapped = new RetryError({
      message: "Failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [oauth2Error],
    });

    const error = topicProviderError(wrapped, model);

    expect(error.reason).toBe("authentication");
    expect(isRejectedConnection(error)).toBe(true);
  });
});
