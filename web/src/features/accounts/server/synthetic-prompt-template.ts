import { PromptType } from "@langfuse/shared";

export const SYNTHETIC_CONVERSATION_TEMPLATE = {
  type: PromptType.Text as const,
  prompt:
    "You are a helpful AI assistant. Please respond to the user's message: {{user_message}}",
  config: {},
  tags: ["synthetic", "conversation", "template"],
  labels: ["latest"],
};

export const createSyntheticPromptName = (username: string, tag: string) => {
  return `Synthetic Conversation - ${username}-${tag}`;
};
