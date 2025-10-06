import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";
import { z } from "zod/v4";

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

// Tool call in OpenAI standard format
export const LangfuseChatMLToolCallSchema = z.object({
  id: z.string().nullable(), // null if not provided in input
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(), // JSON string
  }),
});

// Individual message in LangfuseChatML format
export const LangfuseChatMLMessageSchema = z.object({
  id: z.string().optional(),
  role: z.string(),
  name: z.string().optional(),
  // Content can be string, array, object, or null - intentionally loose
  content: z.unknown().optional(),
  audio: z.unknown().optional(), // OpenAIOutputAudioType - rare, keep loose
  metadata: z.record(z.unknown()).optional(),
  type: z.string().optional(), // "placeholder" or other special types
  json: z.record(z.unknown()).optional(),

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
  additional: z.record(z.unknown()).optional(),
});

// Output wrapper
export const LangfuseChatMLOutputSchema = z.object({
  messages: z.array(LangfuseChatMLMessageSchema),
  additional: z.record(z.unknown()).optional(),
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

// ============================================================================
// TypeScript Types (derived from Zod schemas)
// ============================================================================

// Derive types from schemas to eliminate duplication
export type LangfuseChatMLMessage = z.infer<typeof LangfuseChatMLMessageSchema>;
export type LangfuseChatMLInput = z.infer<typeof LangfuseChatMLInputSchema>;
export type LangfuseChatMLOutput = z.infer<typeof LangfuseChatMLOutputSchema>;

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
