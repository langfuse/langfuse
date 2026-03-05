import { describe, it, expect } from "vitest";
import { LLMCompletionError } from "@langfuse/shared/src/server";

describe("LLMCompletionError.isUnrecoverable", () => {
  it("returns true for 401", () => {
    const err = new LLMCompletionError({
      message: "Unauthorized",
      responseStatusCode: 401,
    });
    expect(err.isUnrecoverable()).toBe(true);
  });

  it("returns true for 404", () => {
    const err = new LLMCompletionError({
      message: "Not found",
      responseStatusCode: 404,
    });
    expect(err.isUnrecoverable()).toBe(true);
  });

  it("returns false for 500 with generic message", () => {
    const err = new LLMCompletionError({
      message: "Internal server error",
      responseStatusCode: 500,
    });
    expect(err.isUnrecoverable()).toBe(false);
  });

  it("returns true when message matches unrecoverable pattern", () => {
    const err = new LLMCompletionError({
      message:
        "Model use case details have not been submitted for this account",
      responseStatusCode: 500,
    });
    expect(err.isUnrecoverable()).toBe(true);
  });
});

describe("LLMCompletionError.getSuspendCode", () => {
  it("returns LLM_401 for 401", () => {
    const err = new LLMCompletionError({
      message: "Unauthorized",
      responseStatusCode: 401,
    });
    expect(err.getSuspendCode()).toBe("LLM_401");
  });

  it("returns LLM_404 for 404", () => {
    const err = new LLMCompletionError({
      message: "Not found",
      responseStatusCode: 404,
    });
    expect(err.getSuspendCode()).toBe("LLM_404");
  });

  it("returns null for non-suspendable status codes", () => {
    const err = new LLMCompletionError({
      message: "Internal server error",
      responseStatusCode: 500,
    });
    expect(err.getSuspendCode()).toBeNull();
  });

  it("returns LLM_ACCOUNT_USE_CASE_NOT_SUBMITTED when message matches use case pattern", () => {
    const err = new LLMCompletionError({
      message:
        "Model use case details have not been submitted for this account",
      responseStatusCode: 500,
    });
    expect(err.getSuspendCode()).toBe("LLM_ACCOUNT_USE_CASE_NOT_SUBMITTED");
  });

  it("returns null for timeout message", () => {
    const err = new LLMCompletionError({
      message: "Request timed out",
      responseStatusCode: 500,
    });
    expect(err.isUnrecoverable()).toBe(false);
    expect(err.getSuspendCode()).toBeNull();
  });

  it("returns LLM_INVALID_RESPONSE when message contains JSON or TypeError", () => {
    expect(
      new LLMCompletionError({
        message: "Response is not valid JSON at position 0",
        responseStatusCode: 500,
      }).getSuspendCode(),
    ).toBe("LLM_INVALID_RESPONSE");
    expect(
      new LLMCompletionError({
        message: "Unterminated string in JSON at position 5",
        responseStatusCode: 500,
      }).getSuspendCode(),
    ).toBe("LLM_INVALID_RESPONSE");
    expect(
      new LLMCompletionError({
        message: "TypeError: something went wrong",
        responseStatusCode: 500,
      }).getSuspendCode(),
    ).toBe("LLM_INVALID_RESPONSE");
  });

  it("uses the suspend code set at throw-time when provided", () => {
    const err = new LLMCompletionError({
      message: "Unauthorized",
      responseStatusCode: 500,
      suspendCode: "LLM_401",
    });
    expect(err.getSuspendCode()).toBe("LLM_401");
  });
});
