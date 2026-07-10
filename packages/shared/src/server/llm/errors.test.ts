import { EvaluatorBlockReason } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { mapToLLMCompletionError } from "./completionErrorMapping";
import { inferLLMCompletionBlockReason, LLMCompletionError } from "./errors";

function errorWithStatus(message: string, status?: number): Error {
  const error = new Error(message);
  if (status !== undefined) {
    (error as any).status = status;
  }
  return error;
}

describe("inferLLMCompletionBlockReason", () => {
  it("maps 401 to LLM_CONNECTION_AUTH_INVALID", () => {
    expect(
      inferLLMCompletionBlockReason({
        responseStatusCode: 401,
        message: "Unauthorized",
      }),
    ).toBe(EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID);
  });

  it("maps 404 to EVAL_MODEL_UNAVAILABLE", () => {
    expect(
      inferLLMCompletionBlockReason({
        responseStatusCode: 404,
        message: "Model not found",
      }),
    ).toBe(EvaluatorBlockReason.EVAL_MODEL_UNAVAILABLE);
  });

  it("maps 402 to LLM_CONNECTION_BILLING_EXHAUSTED", () => {
    expect(
      inferLLMCompletionBlockReason({
        responseStatusCode: 402,
        message: "Payment required",
      }),
    ).toBe(EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED);
  });

  it.each([
    // OpenRouter (402, but the status is often only embedded in the message)
    "402 Insufficient credits. Add more using https://openrouter.ai/settings/credits",
    // Anthropic (400 invalid_request_error)
    '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}',
    // Google AI Studio prepaid billing
    "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.",
    // LiteLLM proxy budgets (surfaces as 400 or 429)
    "400 Budget has been exceeded! Team=abc Current cost: 20.003, Max budget: 20.0",
    // OpenAI insufficient_quota (surfaces as 429)
    "429 You exceeded your current quota, please check your plan and billing details.",
  ])(
    "maps billing exhaustion message %s to LLM_CONNECTION_BILLING_EXHAUSTED",
    (message) => {
      expect(
        inferLLMCompletionBlockReason({ responseStatusCode: 400, message }),
      ).toBe(EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED);
    },
  );

  it("maps revoked GCP service account grants to LLM_CONNECTION_AUTH_INVALID", () => {
    expect(
      inferLLMCompletionBlockReason({
        responseStatusCode: 500,
        message: "invalid_grant: Invalid grant: account not found",
      }),
    ).toBe(EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID);
  });

  it("maps OpenRouter monthly key limit exhaustion to LLM_CONNECTION_BILLING_EXHAUSTED", () => {
    expect(
      inferLLMCompletionBlockReason({
        responseStatusCode: 402,
        message:
          "This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens, but can only afford 62702.",
      }),
    ).toBe(EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED);
  });

  it("maps unresolvable custom endpoint hostnames to LLM_CONNECTION_ENDPOINT_UNREACHABLE", () => {
    expect(
      inferLLMCompletionBlockReason({
        responseStatusCode: 500,
        message: "DNS lookup failed for litellm.internal.example.com",
      }),
    ).toBe(EvaluatorBlockReason.LLM_CONNECTION_ENDPOINT_UNREACHABLE);
  });

  it("maps Google's non-401 invalid API key message to LLM_CONNECTION_AUTH_INVALID", () => {
    expect(
      inferLLMCompletionBlockReason({
        responseStatusCode: 400,
        message: "API key not valid. Please pass a valid API key.",
      }),
    ).toBe(EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID);
  });

  it("returns null for generic client errors", () => {
    expect(
      inferLLMCompletionBlockReason({
        responseStatusCode: 400,
        message: "messages: at least one message is required",
      }),
    ).toBeNull();
  });
});

describe("LLMCompletionError retryability for block-worthy errors", () => {
  it("forces isRetryable=false when a block reason is inferred", () => {
    const error = new LLMCompletionError({
      message: "429 Budget has been exceeded! Current cost: 10.0",
      responseStatusCode: 429,
      isRetryable: true,
    });

    expect(error.getEvaluatorBlockReason()).toBe(
      EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
    );
    expect(error.isRetryable).toBe(false);
  });

  it("keeps caller-provided retryability when no block reason applies", () => {
    const error = new LLMCompletionError({
      message: "429 Rate limit reached for gpt-4o-mini, try again in 356ms",
      responseStatusCode: 429,
      isRetryable: true,
    });

    expect(error.getEvaluatorBlockReason()).toBeNull();
    expect(error.isRetryable).toBe(true);
  });
});

describe("mapToLLMCompletionError billing classification", () => {
  it("blocks and does not retry OpenAI insufficient_quota 429s", () => {
    const cause = errorWithStatus(
      "429 You exceeded your current quota, please check your plan and billing details.",
      429,
    );
    cause.name = "InsufficientQuotaError";

    const mapped = mapToLLMCompletionError(cause);

    expect(mapped.responseStatusCode).toBe(429);
    expect(mapped.isRetryable).toBe(false);
    expect(mapped.getEvaluatorBlockReason()).toBe(
      EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
    );
  });

  it("blocks OpenRouter 402 insufficient credits", () => {
    const mapped = mapToLLMCompletionError(
      errorWithStatus(
        "402 Insufficient credits. Add more using https://openrouter.ai/settings/credits",
        402,
      ),
    );

    expect(mapped.isRetryable).toBe(false);
    expect(mapped.getEvaluatorBlockReason()).toBe(
      EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
    );
  });

  it("blocks Anthropic low-credit 400s", () => {
    const mapped = mapToLLMCompletionError(
      errorWithStatus(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
        400,
      ),
    );

    expect(mapped.isRetryable).toBe(false);
    expect(mapped.getEvaluatorBlockReason()).toBe(
      EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
    );
  });

  it("blocks Google invalid-API-key 400s as auth failures", () => {
    const mapped = mapToLLMCompletionError(
      errorWithStatus("API key not valid. Please pass a valid API key.", 400),
    );

    expect(mapped.isRetryable).toBe(false);
    expect(mapped.getEvaluatorBlockReason()).toBe(
      EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
    );
  });

  it("surfaces DNS failures hidden behind SDK connection-error wrappers and blocks", () => {
    // Anthropic/OpenAI SDKs wrap secureLlmFetch failures as
    // `APIConnectionError { message: "Connection error.", cause }`.
    const mapped = mapToLLMCompletionError(
      new Error("Connection error.", {
        cause: new Error("DNS lookup failed for litellm.internal.example.com"),
      }),
    );

    expect(mapped.message).toBe(
      "DNS lookup failed for litellm.internal.example.com",
    );
    expect(mapped.isRetryable).toBe(false);
    expect(mapped.getEvaluatorBlockReason()).toBe(
      EvaluatorBlockReason.LLM_CONNECTION_ENDPOINT_UNREACHABLE,
    );
  });

  it("does not retry status-less invalid_grant auth failures", () => {
    const mapped = mapToLLMCompletionError(
      new Error("invalid_grant: Invalid grant: account not found"),
    );

    expect(mapped.isRetryable).toBe(false);
    expect(mapped.getEvaluatorBlockReason()).toBe(
      EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
    );
  });

  it("keeps generic connection errors retryable and unblocked", () => {
    const mapped = mapToLLMCompletionError(new Error("Connection error."));

    expect(mapped.isRetryable).toBe(true);
    expect(mapped.getEvaluatorBlockReason()).toBeNull();
  });

  it("keeps plain rate-limit 429s retryable and unblocked", () => {
    const mapped = mapToLLMCompletionError(
      errorWithStatus(
        "429 Your requests to gpt-5-mini in eastus have exceeded rate limit.",
        429,
      ),
    );

    expect(mapped.isRetryable).toBe(true);
    expect(mapped.getEvaluatorBlockReason()).toBeNull();
  });

  it("keeps 5xx errors retryable and unblocked", () => {
    const mapped = mapToLLMCompletionError(
      errorWithStatus("Request failed with status code 502", 502),
    );

    expect(mapped.isRetryable).toBe(true);
    expect(mapped.getEvaluatorBlockReason()).toBeNull();
  });
});
