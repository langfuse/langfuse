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

export type ObservationIOParser<NormalizedIO> = (span: SpanIO) => NormalizedIO;

export type JsonPrimitive = string | number | boolean | null;

export type JsonObject = { [key: string]: JsonValue };

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type NormalizedPartBase = {
  providerMetadata?: JsonObject;
};

export type TextPart = NormalizedPartBase & {
  type: "text";
  text: string;
};

export type ReasoningPart = NormalizedPartBase & {
  type: "reasoning";
  text?: string;
  data?: JsonValue;
};

export type ToolCallPart = NormalizedPartBase & {
  type: "tool-call";
  toolCallId: string | null;
  toolName: string;
  input: JsonValue;
  toolType?: string;
  index?: number;
  providerExecuted?: boolean;
};

export type ToolResultPart = NormalizedPartBase & {
  type: "tool-result";
  toolCallId: string | null;
  toolName?: string;
  output: JsonValue;
  isError?: boolean;
};

// TODO: parser does not emit file parts yet.
export type FilePart = NormalizedPartBase & {
  type: "file";
  mediaType: string;
  filename?: string;
  content:
    | { kind: "url"; url: string }
    | { kind: "base64"; data: string }
    | { kind: "reference"; id: string };
};

export type DataPart = NormalizedPartBase & {
  type: "data";
  name?: string;
  value: JsonValue;
};

export type CustomPart = NormalizedPartBase & {
  type: "custom";
  kind: string;
  value: JsonValue;
};

export type NormalizedMessagePart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | ToolResultPart
  | FilePart
  | DataPart
  | CustomPart;

export type NormalizedMessageRole =
  | "system"
  | "developer"
  | "user"
  | "assistant"
  | "tool"
  | "unknown";

export type NormalizedMessage = {
  id?: string;
  role: NormalizedMessageRole;
  name?: string;
  parts: NormalizedMessagePart[];
  // Preserves the observation input/output boundary in one ordered stream.
  // TODO: not yet part of the canonical normalized-IO format; upstream or fold.
  source: "input" | "output";
};

export type ToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: JsonValue;
  type?: string;
  providerMetadata?: JsonObject;
};

export type NormalizedIO = {
  // Input messages followed by output messages. Message and part order is preserved.
  messages: NormalizedMessage[];
  toolDefinitions: ToolDefinition[];
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
