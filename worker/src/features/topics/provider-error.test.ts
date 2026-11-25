import { describe, expect, it } from "vitest";
import { topicProviderError } from "./provider-error";

describe("topicProviderError", () => {
  it("classifies a 429 the AI SDK gave up retrying as a rate limit", () => {
    // Shape of the AI SDK's RetryError: the provider error sits in lastError, with no cause.
    const providerError = Object.assign(new Error("Too many requests"), {
      name: "AI_APICallError",
      statusCode: 429,
    });
    const retryError = Object.assign(
      new Error("Failed after 3 attempts. Last error: Too many requests"),
      {
        name: "AI_RetryError",
        errors: [providerError],
        lastError: providerError,
      },
    );

    const failure = topicProviderError(retryError, {
      slot: "summary",
      provider: "Bedrock",
      model: "us.anthropic.claude-haiku-5-5",
    });

    expect(failure.reason).toBe("rate_limit");
    expect(failure.details.httpStatus).toBe(429);
  });
});
