import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertValidAnthropicVertexModelName,
  assertValidVertexLocation,
  buildVertexModel,
  isClaudeModel,
} from "./vertex";
import { VERTEXAI_USE_DEFAULT_CREDENTIALS } from "../../../../interfaces/customLLMProviderConfigSchemas";

// Shared mutable state for the module mocks below. vi.hoisted runs before the
// mock factories so these refs exist when the factories are evaluated.
const h = vi.hoisted(() => ({
  createVertex: vi.fn((_options?: Record<string, unknown>) =>
    vi.fn(() => ({ id: "gemini-model" })),
  ),
  createVertexAnthropic: vi.fn((_options?: Record<string, unknown>) =>
    vi.fn(() => ({ id: "claude-model" })),
  ),
  getProjectId: vi.fn(async () => "adc-detected-project"),
  googleAuthCtorArgs: [] as Array<Record<string, unknown>>,
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined as string | undefined,
    VERTEXAI_ADC_ALLOW_PROJECT_OVERRIDE: "false" as string | undefined,
  },
}));

vi.mock("@ai-sdk/google-vertex", () => ({ createVertex: h.createVertex }));
vi.mock("@ai-sdk/google-vertex/anthropic", () => ({
  createVertexAnthropic: h.createVertexAnthropic,
}));
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    constructor(opts: Record<string, unknown>) {
      h.googleAuthCtorArgs.push(opts);
    }
    getProjectId = h.getProjectId;
  },
}));
vi.mock("../../../../env", () => ({ env: h.env }));

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

describe("buildVertexModel ADC project override", () => {
  const fetchStub = (() => undefined) as unknown as typeof fetch;

  const lastVertexArgs = () =>
    h.createVertex.mock.calls.at(-1)?.[0] as
      | { project?: string; googleAuthOptions?: unknown }
      | undefined;
  const lastVertexAnthropicArgs = () =>
    h.createVertexAnthropic.mock.calls.at(-1)?.[0] as
      | { project?: string; googleAuthOptions?: unknown }
      | undefined;

  const build = (
    config: Record<string, unknown> | null,
    modelId = "gemini-2.5-flash",
  ) =>
    buildVertexModel({
      modelId,
      apiKey: VERTEXAI_USE_DEFAULT_CREDENTIALS,
      config: config as never,
      fetch: fetchStub,
    });

  beforeEach(() => {
    h.createVertex.mockClear();
    h.createVertexAnthropic.mockClear();
    h.getProjectId.mockClear();
    h.googleAuthCtorArgs.length = 0;
    h.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    h.env.VERTEXAI_ADC_ALLOW_PROJECT_OVERRIDE = "false";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ignores config.projectId with ADC when the override flag is off (Gemini)", async () => {
    await build({ projectId: "should-be-ignored" });

    expect(h.getProjectId).toHaveBeenCalledTimes(1);
    expect(lastVertexArgs()?.project).toBe("adc-detected-project");
    expect(lastVertexArgs()?.googleAuthOptions).toBeUndefined();
  });

  it("re-targets project + auth to config.projectId when the flag is on (Gemini)", async () => {
    h.env.VERTEXAI_ADC_ALLOW_PROJECT_OVERRIDE = "true";

    await build({ projectId: "gcp-prod-ml" });

    // The override supplies the project directly, so ADC discovery is skipped.
    expect(h.getProjectId).not.toHaveBeenCalled();
    expect(lastVertexArgs()?.project).toBe("gcp-prod-ml");
    expect(lastVertexArgs()?.googleAuthOptions).toEqual({
      projectId: "gcp-prod-ml",
    });
  });

  it("re-targets project + auth for Claude-on-Vertex when the flag is on", async () => {
    h.env.VERTEXAI_ADC_ALLOW_PROJECT_OVERRIDE = "true";

    await build(
      { projectId: "gcp-prod-ml", location: "us-east5" },
      "claude-sonnet-4-5@20250929",
    );

    expect(h.getProjectId).not.toHaveBeenCalled();
    expect(lastVertexAnthropicArgs()?.project).toBe("gcp-prod-ml");
    expect(lastVertexAnthropicArgs()?.googleAuthOptions).toEqual({
      projectId: "gcp-prod-ml",
    });
  });

  it("falls back to ADC discovery when the flag is on but no projectId is configured", async () => {
    h.env.VERTEXAI_ADC_ALLOW_PROJECT_OVERRIDE = "true";

    await build({ location: "us-east5" });

    expect(h.getProjectId).toHaveBeenCalledTimes(1);
    expect(lastVertexArgs()?.project).toBe("adc-detected-project");
    expect(lastVertexArgs()?.googleAuthOptions).toBeUndefined();
  });
});
