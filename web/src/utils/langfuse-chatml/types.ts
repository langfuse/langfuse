import { z } from "zod/v4";

// Zod Schemas for Runtime Validation
// intentionally self-contained to avoid circular dependencies

// like Tool call in OpenAI format
export const LangfuseChatMLToolCallSchema = z.object({
  id: z.string().nullable(), // null if not provided in input
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

export const LangfuseChatMLMessageSchema = z.object({
  id: z.string().optional(),
  role: z.string(),
  name: z.string().optional(),
  // Content can be:
  // - string (text messages)
  // - array (multimodal: text/image/audio parts)
  // - null/undefined
  content: z.union([z.string(), z.array(z.any()), z.null()]).optional(),
  audio: z.any().optional(), // Audio output (rare, keep loose)
  metadata: z.record(z.string(), z.unknown()).optional(),
  type: z.string().optional(), // "placeholder" or other special types
  json: z.record(z.string(), z.unknown()).optional(),

  // Tool calls (assistant messages)
  toolCalls: z.array(LangfuseChatMLToolCallSchema).optional(),

  // Tool results (tool role messages)
  toolCallId: z.string().optional(),
  toolResultStatus: z.enum(["ok", "error"]).optional(),
  toolError: z.string().optional(),

  // LangGraph: preserve original role for tool call ID matching
  _originalRole: z.string().optional(),
});

// Input wrapper
export const LangfuseChatMLInputSchema = z.object({
  messages: z.array(LangfuseChatMLMessageSchema),
  additional: z.record(z.string(), z.unknown()).optional(),
});

// Output wrapper
export const LangfuseChatMLOutputSchema = z.object({
  messages: z.array(LangfuseChatMLMessageSchema),
  additional: z.record(z.string(), z.unknown()).optional(),
});

// Data portion of LangfuseChatML (without methods)
export const LangfuseChatMLDataSchema = z.object({
  input: LangfuseChatMLInputSchema,
  output: LangfuseChatMLOutputSchema,
  dataSource: z.string().optional(),
  dataSourceVersion: z.string().optional(),
  highlightMessageId: z.string().optional(),
  _selectedMapper: z.string().optional(),
});

// TypeScript Types from Zod schemas

// Derive types from schemas to eliminate duplication
export type LangfuseChatMLMessage = z.infer<typeof LangfuseChatMLMessageSchema>;
export type LangfuseChatMLInput = z.infer<typeof LangfuseChatMLInputSchema>;
export type LangfuseChatMLOutput = z.infer<typeof LangfuseChatMLOutputSchema>;

// Re-export a compatible type for ChatMlMessageSchema (used by UI components)
// This is the transformed message format after mapToChatMl processing
export type ChatMlMessageSchema = {
  role?: string;
  name?: string;
  content?: string | any[] | Record<string, any> | null;
  audio?: any;
  type?: string;
  json?: Record<string, any>;
};

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
