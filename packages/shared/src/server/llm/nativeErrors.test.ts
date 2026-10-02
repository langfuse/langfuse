import { EvaluatorBlockReason } from "@prisma/client";
import { APICallError, NoOutputGeneratedError, RetryError } from "ai";
import { describe, expect, it } from "vitest";

import { classifyEvaluatorLlmError } from "../evals/classifyEvaluatorLlmError";
import {
  getLLMErrorInfo,
  LLMValidationError,
  type LLMValidationErrorCode,
} from "./errors";

function apiCallError(params: {
  message: string;
  statusCode?: number;
  isRetryable?: boolean;
  data?: unknown;
}) {
  return new APICallError({
    message: params.message,
    url: "https://api.example.com/v1/messages",
    requestBodyValues: {},
    statusCode: params.statusCode,
    isRetryable: params.isRetryable,
    data: params.data,
  });
}

describe("getLLMErrorInfo", () => {
  it("uses the final AI SDK retry error instead of remapping the wrapper", () => {
    const firstError = apiCallError({
      message: "Service unavailable",
      statusCode: 503,
    });
    const finalError = apiCallError({
      message: "Invalid request",
      statusCode: 400,
    });
    const retryError = new RetryError({
      message: "Failed after 2 attempts",
      reason: "errorNotRetryable",
      errors: [firstError, finalError],
    });

    expect(getLLMErrorInfo(retryError)).toMatchObject({
      kind: "provider",
      message: "Invalid request",
      statusCode: 400,
      isRetryable: false,
      providerError: finalError,
      retryError,
    });
  });

  it("keeps an exhausted retryable provider failure retryable for the durable queue", () => {
    const rateLimitError = apiCallError({
      message: "Rate limit reached",
      statusCode: 429,
    });
    const retryError = new RetryError({
      message: "Failed after 2 attempts",
      reason: "maxRetriesExceeded",
      errors: [rateLimitError, rateLimitError],
    });

    expect(getLLMErrorInfo(retryError)).toMatchObject({
      kind: "provider",
      message: "Rate limit reached",
      statusCode: 429,
      isRetryable: true,
      providerError: rateLimitError,
    });
  });

  it("recognizes AI SDK semantic errors as terminal operational failures", () => {
    const error = new NoOutputGeneratedError({
      message: "The model did not generate output",
    });

    expect(getLLMErrorInfo(error)).toMatchObject({
      kind: "ai-sdk",
      message: "The model did not generate output",
      isRetryable: false,
    });
  });

  it("recognizes Langfuse validation errors without adding retry state to the error", () => {
    const code: LLMValidationErrorCode = "invalid-request";
    const error = new LLMValidationError({
      code,
      message: "Executable tools are not supported",
    });

    expect(error).not.toHaveProperty("isRetryable");
    expect(getLLMErrorInfo(error)).toMatchObject({
      kind: "validation",
      message: "Executable tools are not supported",
      statusCode: 400,
      isRetryable: false,
    });
  });

  it("recognizes native timeout errors as terminal operational failures", () => {
    const error = new DOMException("The operation timed out", "TimeoutError");

    expect(getLLMErrorInfo(error)).toMatchObject({
      kind: "timeout",
      message: "The operation timed out",
      isRetryable: false,
    });
  });

  it("does not turn unknown application errors into user-visible LLM failures", () => {
    expect(getLLMErrorInfo(new Error("database password leaked"))).toBeNull();
  });
});

describe("classifyEvaluatorLlmError", () => {
  it("uses the provider's structured insufficient_quota code for billing blocks", () => {
    const error = apiCallError({
      message: "You exceeded your current quota",
      statusCode: 429,
      data: {
        error: {
          message: "You exceeded your current quota",
          type: "insufficient_quota",
          code: "insufficient_quota",
        },
      },
    });

    expect(classifyEvaluatorLlmError(error)).toMatchObject({
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
      isRetryable: false,
    });
  });

  it("does not treat generic quota wording as proof of billing exhaustion", () => {
    const error = apiCallError({
      message: "You exceeded your current quota",
      statusCode: 429,
      data: {
        error: {
          message: "You exceeded your current quota",
          status: "RESOURCE_EXHAUSTED",
        },
      },
    });

    expect(classifyEvaluatorLlmError(error)).toMatchObject({
      blockReason: null,
      isRetryable: true,
    });
  });

  it.each([
    [401, EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID],
    [402, EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED],
    [404, EvaluatorBlockReason.EVAL_MODEL_UNAVAILABLE],
  ])(
    "maps provider status %i to evaluator block reason %s",
    (status, reason) => {
      const error = apiCallError({
        message: "Provider error",
        statusCode: status,
      });

      expect(classifyEvaluatorLlmError(error)?.blockReason).toBe(reason);
    },
  );

  it("keeps narrow provider-specific message fallbacks isolated to evaluator policy", () => {
    const error = apiCallError({
      message: "Your credit balance is too low to access the Anthropic API.",
      statusCode: 400,
      data: {
        type: "error",
        error: {
          type: "invalid_request_error",
          message:
            "Your credit balance is too low to access the Anthropic API.",
        },
      },
    });

    expect(classifyEvaluatorLlmError(error)?.blockReason).toBe(
      EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
    );
  });

  it.each([
    [
      "Model use case details have not been submitted for this account",
      EvaluatorBlockReason.PROVIDER_ACCOUNT_NOT_READY,
    ],
    [
      "API key not valid. Please pass a valid API key.",
      EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
    ],
    [
      "Insufficient credits. Add more credits to continue.",
      EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
    ],
    [
      "Your prepayment credits are depleted.",
      EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
    ],
    [
      "Budget has been exceeded! Team=abc",
      EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
    ],
    [
      "This request requires more credits, or fewer max_tokens.",
      EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
    ],
  ])("retains the terminal provider fallback for %s", (message, reason) => {
    const error = apiCallError({ message, statusCode: 400 });

    expect(classifyEvaluatorLlmError(error)?.blockReason).toBe(reason);
  });

  it("blocks typed endpoint resolution failures without inspecting messages", () => {
    const error = new LLMValidationError({
      code: "endpoint-unreachable",
      message: "Could not resolve the configured endpoint",
    });

    expect(classifyEvaluatorLlmError(error)).toMatchObject({
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_ENDPOINT_UNREACHABLE,
      isRetryable: false,
    });
  });

  it("keeps exact terminal signatures as evaluator-only fallbacks", () => {
    const error = new Error("Connection error.", {
      cause: new Error("invalid_grant: Invalid grant: account not found"),
    });

    expect(classifyEvaluatorLlmError(error)).toMatchObject({
      kind: "evaluator-policy",
      message: "invalid_grant: Invalid grant: account not found",
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
      isRetryable: false,
    });
  });
});
