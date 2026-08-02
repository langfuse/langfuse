/** @jest-environment node */

import { buildMetaPromptMessages } from "@/src/features/meta-prompt/server/buildMetaPromptMessages";
import {
  META_PROMPT_SYSTEM_PROMPT,
  PLATFORM_RULES,
} from "@/src/features/meta-prompt/constants/systemPrompt";
import {
  ChatMessageRole,
  ChatMessageType,
  type ChatMessage,
} from "@langfuse/shared/src/server";

describe("buildMetaPromptMessages", () => {
  const createUserMessage = (content: string): ChatMessage => ({
    type: ChatMessageType.User as const,
    role: ChatMessageRole.User as const,
    content,
  });

  it("should place system prompt as the first message", () => {
    const userMessages: ChatMessage[] = [
      createUserMessage("Improve my prompt"),
    ];

    const result = buildMetaPromptMessages({
      userMessages,
      targetPlatform: "generic",
    });

    expect(result.length).toBe(2);
    expect(result[0].role).toBe(ChatMessageRole.System);
    expect(result[0].type).toBe(ChatMessageType.System);
  });

  it("should append user messages after system prompt", () => {
    const userMessages: ChatMessage[] = [
      createUserMessage("First message"),
      createUserMessage("Second message"),
    ];

    const result = buildMetaPromptMessages({
      userMessages,
      targetPlatform: "generic",
    });

    expect(result.length).toBe(3);
    expect(result[1]).toEqual(userMessages[0]);
    expect(result[2]).toEqual(userMessages[1]);
  });

  it("should inject OpenAI platform rules for openai target", () => {
    const result = buildMetaPromptMessages({
      userMessages: [createUserMessage("test")],
      targetPlatform: "openai",
    });

    const systemContent = result[0].content as string;
    expect(systemContent).toContain("PLATFORM FORMATTING RULES (OpenAI)");
    expect(systemContent).toContain("Use ### blocks or triple quotes");
    expect(systemContent).not.toContain("{{PLATFORM_FORMATTING_RULES}}");
  });

  it("should inject Claude platform rules for claude target", () => {
    const result = buildMetaPromptMessages({
      userMessages: [createUserMessage("test")],
      targetPlatform: "claude",
    });

    const systemContent = result[0].content as string;
    expect(systemContent).toContain(
      "PLATFORM FORMATTING RULES (Claude/Anthropic)",
    );
    expect(systemContent).toContain("Use XML tags for structure");
  });

  it("should inject Gemini platform rules for gemini target", () => {
    const result = buildMetaPromptMessages({
      userMessages: [createUserMessage("test")],
      targetPlatform: "gemini",
    });

    const systemContent = result[0].content as string;
    expect(systemContent).toContain(
      "PLATFORM FORMATTING RULES (Google Gemini)",
    );
    expect(systemContent).toContain("System Instruction");
  });

  it("should inject Generic platform rules for generic target", () => {
    const result = buildMetaPromptMessages({
      userMessages: [createUserMessage("test")],
      targetPlatform: "generic",
    });

    const systemContent = result[0].content as string;
    expect(systemContent).toContain("PLATFORM FORMATTING RULES (Generic)");
    expect(systemContent).toContain(
      "Ensure compatibility across different LLM providers",
    );
  });

  it("should fall back to generic rules for unknown platform", () => {
    const result = buildMetaPromptMessages({
      userMessages: [createUserMessage("test")],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targetPlatform: "unknown-platform" as any,
    });

    const systemContent = result[0].content as string;
    expect(systemContent).toContain("PLATFORM FORMATTING RULES (Generic)");
  });

  it("should replace the placeholder in system prompt template", () => {
    const result = buildMetaPromptMessages({
      userMessages: [createUserMessage("test")],
      targetPlatform: "openai",
    });

    const systemContent = result[0].content as string;
    expect(systemContent).not.toContain("{{PLATFORM_FORMATTING_RULES}}");

    const expectedContent = META_PROMPT_SYSTEM_PROMPT.replace(
      "{{PLATFORM_FORMATTING_RULES}}",
      PLATFORM_RULES.openai,
    );
    expect(systemContent).toBe(expectedContent);
  });

  it("should handle empty user messages array", () => {
    const result = buildMetaPromptMessages({
      userMessages: [],
      targetPlatform: "generic",
    });

    expect(result.length).toBe(1);
    expect(result[0].role).toBe(ChatMessageRole.System);
  });
});
