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
