import { APICallError, RetryError } from "ai";
import { EvaluatorBlockReason } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { OAuth2TokenError } from "../llm/oauth2/errors";
import { classifyEvaluatorLlmError } from "./classifyEvaluatorLlmError";

describe("classifyEvaluatorLlmError", () => {
  it("blocks on a credential OAuth2TokenError", () => {
    const error = new OAuth2TokenError(
      "credential",
      "OAuth2 token endpoint returned 401: invalid_client",
    );

    expect(classifyEvaluatorLlmError(error)).toMatchObject({
      kind: "evaluator-policy",
      message: error.message,
      isRetryable: false,
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
    });
  });

  it("blocks on a config OAuth2TokenError", () => {
    const error = new OAuth2TokenError(
      "config",
      "Invalid OAuth2 connection config",
    );

    expect(classifyEvaluatorLlmError(error)).toMatchObject({
      kind: "evaluator-policy",
      message: error.message,
      isRetryable: false,
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
    });
  });

  it("does not block on a disabled OAuth2TokenError", () => {
    const error = new OAuth2TokenError(
      "disabled",
      "OAuth2 client credentials are disabled: set LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS",
    );

    expect(classifyEvaluatorLlmError(error)).toMatchObject({
      kind: "evaluator-policy",
      message: error.message,
      isRetryable: false,
      blockReason: null,
    });
  });

  it("does not block on an unavailable OAuth2TokenError", () => {
    const error = new OAuth2TokenError(
      "unavailable",
      "OAuth2 token endpoint unavailable after 3 attempts: 503",
    );

    expect(classifyEvaluatorLlmError(error)).toMatchObject({
      kind: "evaluator-policy",
      message: error.message,
      isRetryable: false,
      blockReason: null,
    });
  });

  it("finds an unavailable OAuth2TokenError wrapped by the AI SDK and does not treat it as a retryable provider error", () => {
    const oauth2Error = new OAuth2TokenError(
      "unavailable",
      "OAuth2 token endpoint unavailable after 3 attempts: 503",
    );
    const wrapped = new APICallError({
      message: "fetch failed",
      url: "https://api.example.com/v1/chat/completions",
      requestBodyValues: {},
      isRetryable: true,
      cause: oauth2Error,
    });

    expect(classifyEvaluatorLlmError(wrapped)).toMatchObject({
      kind: "evaluator-policy",
      message: oauth2Error.message,
      isRetryable: false,
      blockReason: null,
    });
  });

  it("finds a credential OAuth2TokenError wrapped by the AI SDK and ignores the wrapper's status code", () => {
    const oauth2Error = new OAuth2TokenError(
      "credential",
      "OAuth2 token endpoint returned 401: invalid_client",
      { status: 401 },
    );
    const wrapped = new APICallError({
      message: "Unauthorized",
      url: "https://api.example.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
      cause: oauth2Error,
    });

    expect(classifyEvaluatorLlmError(wrapped)).toMatchObject({
      kind: "evaluator-policy",
      message: oauth2Error.message,
      isRetryable: false,
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
    });
  });

  it("finds a credential OAuth2TokenError wrapped in a RetryError (retries exhausted after a failed refresh)", () => {
    const oauth2Error = new OAuth2TokenError(
      "credential",
      "OAuth2 token endpoint returned 401: invalid_client",
    );
    const wrapped = new RetryError({
      message: "Failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [oauth2Error],
    });

    expect(classifyEvaluatorLlmError(wrapped)).toMatchObject({
      kind: "evaluator-policy",
      message: oauth2Error.message,
      isRetryable: false,
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
    });
  });

  it("finds an unavailable OAuth2TokenError wrapped in a RetryError and does not treat it as retryable", () => {
    const oauth2Error = new OAuth2TokenError(
      "unavailable",
      "OAuth2 token endpoint unavailable after 3 attempts: 503",
    );
    const wrapped = new RetryError({
      message: "Failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [oauth2Error],
    });

    expect(classifyEvaluatorLlmError(wrapped)).toMatchObject({
      kind: "evaluator-policy",
      message: oauth2Error.message,
      isRetryable: false,
      blockReason: null,
    });
  });

  it("still matches the invalid_grant message pattern for a non-OAuth2 error", () => {
    const error = new Error("Provider rejected the request: invalid_grant");

    expect(classifyEvaluatorLlmError(error)).toMatchObject({
      kind: "evaluator-policy",
      message: error.message,
      isRetryable: false,
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
    });
  });
});
