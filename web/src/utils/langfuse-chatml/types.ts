import type { OpenAIOutputAudioType } from "@/src/components/schemas/ChatMlSchema";
import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";

export interface LangfuseChatMLMessage {
  id?: string; // For highlighting capability
  role: string;
  name?: string;
  content?: string | any[]; // string or OpenAI content parts array
  toolCalls?: any[]; // Tool invocations with IDs
  toolCallId?: string; // Reference to tool call
  audio?: OpenAIOutputAudioType; // Audio data
  metadata?: Record<string, unknown>; // Additional message data
  type?: "placeholder" | string; // Special message types
  json?: Record<string, unknown>; // Extra fields wrapped in json (like current ChatML)
}

export interface LangfuseChatMLInput {
  messages: LangfuseChatMLMessage[];
  additional?: Record<string, unknown>; // Non-message input fields (temperature, model, etc.)
}

export interface LangfuseChatMLOutput {
  messages: LangfuseChatMLMessage[];
  additional?: Record<string, unknown>; // Non-message output fields
}

export interface LangfuseChatML {
  input: LangfuseChatMLInput;
  output: LangfuseChatMLOutput;
  dataSource?: string; // SDK name: "openai", "langgraph", etc.
  dataSourceVersion?: string; // SDK version: "v0", "v1", etc.
  highlightMessageId?: string; // For scrolling to specific message

  // Analysis capabilities
  canDisplayAsChat(): boolean;
  getAllMessages(): ChatMlMessageSchema[]; // Return current ChatML format for compatibility
}
