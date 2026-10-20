import type { z } from "zod";
import type {
  normalizedPartBaseSchema,
  textPartSchema,
  reasoningPartSchema,
  toolCallPartSchema,
  toolResultContentPartSchema,
  toolResultOutputSchema,
  toolResultPartSchema,
  filePartSchema,
  dataPartSchema,
  customPartSchema,
  normalizedMessagePartSchema,
  normalizedMessageRoleSchema,
  finishReasonSchema,
  normalizedMessageSchema,
} from "./schema";

/**
 * The transport-independent observation I/O boundary.
 *
 * OTel and legacy ingestion adapters should produce this shape before a
 * canonical normalized-I/O parser is applied. The values intentionally remain
 * unknown here: parsing and normalization are separate steps.
 */
export type SpanIO = {
  input: unknown;
  output: unknown;
  metadata: unknown;
};

export type JsonPrimitive = string | number | boolean | null;

export type JsonObject = { [key: string]: JsonValue };

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type NormalizedPartBase = z.infer<typeof normalizedPartBaseSchema>;
export type TextPart = z.infer<typeof textPartSchema>;
export type ReasoningPart = z.infer<typeof reasoningPartSchema>;
export type ToolCallPart = z.infer<typeof toolCallPartSchema>;
export type ToolResultContentPart = z.infer<typeof toolResultContentPartSchema>;
export type ToolResultOutput = z.infer<typeof toolResultOutputSchema>;
export type ToolResultPart = z.infer<typeof toolResultPartSchema>;
export type FilePart = z.infer<typeof filePartSchema>;
export type DataPart = z.infer<typeof dataPartSchema>;
export type CustomPart = z.infer<typeof customPartSchema>;
export type NormalizedMessagePart = z.infer<typeof normalizedMessagePartSchema>;
export type NormalizedMessageRole = z.infer<typeof normalizedMessageRoleSchema>;
export type FinishReason = z.infer<typeof finishReasonSchema>;
export type NormalizedMessage = z.infer<typeof normalizedMessageSchema>;

export type ToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: JsonValue;
  type?: string;
  /** Raw provider fields not consumed by the canonical definition. */
  providerMetadata?: JsonObject;
};

export type NormalizedIO = {
  // Input messages followed by output messages. Message and part order is preserved.
  messages: NormalizedMessage[];
  toolDefinitions: ToolDefinition[];
  additionalInput?: Record<string, unknown>;
  /** Raw pre-normalization values compiled from the source; always returned for now. */
  span: SpanIO;
};

/** Decoded value stored as one JSON string in tool_definitions. */
export type ToolDefinitionColumnValue = {
  description: string;
  parameters: string;
};

/** Decoded value stored as one JSON string in tool_calls. */
export type ToolCallColumnValue = {
  id: string;
  arguments: string;
  type: string;
  index: number;
};

/** Exact serialized compatibility shape written to ClickHouse. */
export type ToolColumns = {
  tool_definitions: Record<string, string>;
  tool_calls: string[];
  tool_call_names: string[];
};
