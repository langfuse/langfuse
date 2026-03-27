import {
  META_PROMPT_SYSTEM_PROMPT,
  PLATFORM_RULES,
} from "../constants/systemPrompt";
import {
  type ChatMessage,
  ChatMessageRole,
  ChatMessageType,
} from "@langfuse/shared";
import type { TargetPlatform } from "../types";

export function buildMetaPromptMessages(params: {
  userMessages: ChatMessage[];
  targetPlatform: TargetPlatform;
}): ChatMessage[] {
  const { userMessages, targetPlatform } = params;

  const platformRules =
    PLATFORM_RULES[targetPlatform] ?? PLATFORM_RULES.generic;
  const systemPromptContent = META_PROMPT_SYSTEM_PROMPT.replace(
    "{{PLATFORM_FORMATTING_RULES}}",
    platformRules,
  );

  return [
    {
      type: ChatMessageType.System as const,
      role: ChatMessageRole.System as const,
      content: systemPromptContent,
    },
    ...userMessages,
  ];
}
