/** @jest-environment node */

import { MetaPromptCompletionBodySchema } from "@/src/features/meta-prompt/server/validation";

describe("MetaPromptCompletionBodySchema", () => {
  const validModelParams = {
    provider: "openai",
    adapter: "openai",
    model: "gpt-4o",
  };

  const validMessages = [
    {
      type: "user",
      role: "user",
      content: "Improve this prompt: Write a poem",
    },
  ];

  it("should accept valid input with all fields", () => {
    const input = {
      projectId: "project-123",
      messages: validMessages,
      modelParams: validModelParams,
      targetPlatform: "openai",
      streaming: false,
    };

    const result = MetaPromptCompletionBodySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetPlatform).toBe("openai");
      expect(result.data.streaming).toBe(false);
    }
  });

  it("should apply default values for optional fields", () => {
    const input = {
      projectId: "project-123",
      messages: validMessages,
      modelParams: validModelParams,
    };

    const result = MetaPromptCompletionBodySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetPlatform).toBe("generic");
      expect(result.data.streaming).toBe(true);
    }
  });

  it("should reject missing projectId", () => {
    const input = {
      messages: validMessages,
      modelParams: validModelParams,
    };

    const result = MetaPromptCompletionBodySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should reject missing messages", () => {
    const input = {
      projectId: "project-123",
      modelParams: validModelParams,
    };

    const result = MetaPromptCompletionBodySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should reject missing modelParams", () => {
    const input = {
      projectId: "project-123",
      messages: validMessages,
    };

    const result = MetaPromptCompletionBodySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should reject invalid targetPlatform value", () => {
    const input = {
      projectId: "project-123",
      messages: validMessages,
      modelParams: validModelParams,
      targetPlatform: "invalid-platform",
    };

    const result = MetaPromptCompletionBodySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should accept all valid targetPlatform values", () => {
    const platforms = ["openai", "claude", "gemini", "generic"];

    for (const platform of platforms) {
      const input = {
        projectId: "project-123",
        messages: validMessages,
        modelParams: validModelParams,
        targetPlatform: platform,
      };

      const result = MetaPromptCompletionBodySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.targetPlatform).toBe(platform);
      }
    }
  });

  it("should accept modelParams with optional fields", () => {
    const input = {
      projectId: "project-123",
      messages: validMessages,
      modelParams: {
        ...validModelParams,
        temperature: 0.7,
        max_tokens: 2048,
        top_p: 0.9,
      },
    };

    const result = MetaPromptCompletionBodySchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should reject modelParams missing required provider field", () => {
    const input = {
      projectId: "project-123",
      messages: validMessages,
      modelParams: {
        adapter: "openai",
        model: "gpt-4o",
      },
    };

    const result = MetaPromptCompletionBodySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should reject modelParams with invalid adapter", () => {
    const input = {
      projectId: "project-123",
      messages: validMessages,
      modelParams: {
        provider: "openai",
        adapter: "invalid-adapter",
        model: "gpt-4o",
      },
    };

    const result = MetaPromptCompletionBodySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should accept empty messages array", () => {
    const input = {
      projectId: "project-123",
      messages: [],
      modelParams: validModelParams,
    };

    const result = MetaPromptCompletionBodySchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
