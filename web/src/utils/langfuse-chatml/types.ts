import type { OpenAIOutputAudioType } from "@/src/components/schemas/ChatMlSchema";
import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";

export interface LangfuseChatMLMessage {
  id?: string; // For highlighting capability
  role: string;
  name?: string;
  // todo: this should probably become a [] only per default
  content?: string | any[] | Record<string, any> | null;
  audio?: OpenAIOutputAudioType; // Audio data
  metadata?: Record<string, unknown>; // Additional message data
  type?: "placeholder" | string; // Special message types
  json?: Record<string, unknown>; // Extra fields wrapped in json (like current ChatML)

  // tool call format (for assistant messages)
  toolCalls?: Array<{
    id: string | null; // null if not provided in input
    type: "function";
    function: {
      name: string;
      arguments: string; // JSON string
    };
  }>;

  // Tool results (tool role messages)
  toolCallId?: string;
  toolResultStatus?: "ok" | "error"; // Did tool execution succeed?
  toolError?: string; // Error message if toolResultStatus is "error"

  // LangGraph: preserve original role name for tool call ID matching
  _originalRole?: string;
}

export interface LangfuseChatMLInput {
  messages: LangfuseChatMLMessage[];
  additional?: Record<string, unknown>; // Non-message input fields (temperature, model, etc.)
}

export interface LangfuseChatMLOutput {
  messages: LangfuseChatMLMessage[];
  additional?: Record<string, unknown>; // Non-message output fields
}

// TODO: should probably be a class, has methods
export interface LangfuseChatML {
  input: LangfuseChatMLInput;
  output: LangfuseChatMLOutput;
  dataSource?: string; // SDK name: "openai", "langgraph", etc.
  dataSourceVersion?: string; // SDK version: "v0", "v1", etc.
  highlightMessageId?: string; // For scrolling to specific message

  // as debug info
  _selectedMapper?: string;

  canDisplayAsChat(): boolean;
  getAllMessages(): ChatMlMessageSchema[]; // Return current ChatML format for compatibility
}
