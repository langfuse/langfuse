import { describe, expect, it } from "vitest";

import {
  assertValidAnthropicVertexModelName,
  assertValidVertexLocation,
  isClaudeModel,
} from "./vertex";

describe("isClaudeModel", () => {
  it("detects Claude models case-insensitively", () => {
    expect(isClaudeModel("claude-sonnet-4-5@20250929")).toBe(true);
    expect(isClaudeModel("Claude-Opus-4-1")).toBe(true);
    expect(isClaudeModel("gemini-2.5-flash")).toBe(false);
  });
});

describe("assertValidAnthropicVertexModelName", () => {
  it("accepts single Vertex model ID segments", () => {
    expect(() =>
      assertValidAnthropicVertexModelName("claude-sonnet-4-5@20250929"),
    ).not.toThrow();
  });

  it("rejects names with URL delimiters or traversal", () => {
    expect(() =>
      assertValidAnthropicVertexModelName("claude/../../other"),
    ).toThrow("Invalid Anthropic Vertex AI model name");
    expect(() => assertValidAnthropicVertexModelName("claude..x")).toThrow(
      "Invalid Anthropic Vertex AI model name",
    );
  });
});

describe("assertValidVertexLocation", () => {
  it("accepts region identifiers and undefined", () => {
    expect(() => assertValidVertexLocation("us-east5")).not.toThrow();
    expect(() => assertValidVertexLocation("global")).not.toThrow();
    expect(() => assertValidVertexLocation(undefined)).not.toThrow();
  });

  it("rejects URL-reshaping locations", () => {
    expect(() => assertValidVertexLocation("evil.example.com/")).toThrow(
      "Invalid Vertex AI location",
    );
    expect(() => assertValidVertexLocation("us-east5.attacker")).toThrow(
      "Invalid Vertex AI location",
    );
  });
});
