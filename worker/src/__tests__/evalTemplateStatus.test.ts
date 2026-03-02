import { describe, it, expect } from "vitest";
import {
  getEffectiveEvalTemplateStatus,
  LLMCompletionError,
} from "@langfuse/shared/src/server";

describe("getEffectiveEvalTemplateStatus", () => {
  it("returns ERROR when template.status is ERROR (any projectDefaultModel)", () => {
    expect(
      getEffectiveEvalTemplateStatus(
        { status: "ERROR", provider: null, model: null },
        null,
      ),
    ).toBe("ERROR");
    expect(
      getEffectiveEvalTemplateStatus(
        { status: "ERROR", provider: "openai", model: "gpt-4" },
        { provider: "openai", model: "gpt-4" },
      ),
    ).toBe("ERROR");
  });

  it("returns ERROR when template uses default and project has no default", () => {
    expect(
      getEffectiveEvalTemplateStatus(
        { status: "OK", provider: null, model: null },
        null,
      ),
    ).toBe("ERROR");
  });

  it("returns OK when template uses default and project has default", () => {
    expect(
      getEffectiveEvalTemplateStatus(
        { status: "OK", provider: null, model: null },
        { provider: "openai", model: "gpt-4" },
      ),
    ).toBe("OK");
  });

  it("returns OK when template has specific model and status OK", () => {
    expect(
      getEffectiveEvalTemplateStatus(
        { status: "OK", provider: "openai", model: "gpt-4" },
        null,
      ),
    ).toBe("OK");
    expect(
      getEffectiveEvalTemplateStatus(
        { status: "OK", provider: "openai", model: "gpt-4" },
        { provider: "anthropic", model: "claude-3" },
      ),
    ).toBe("OK");
  });

  it("returns ERROR for edge: status OK, uses default, no project default", () => {
    expect(
      getEffectiveEvalTemplateStatus(
        { status: "OK", provider: null, model: null },
        null,
      ),
    ).toBe("ERROR");
  });
});

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
