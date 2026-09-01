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

/**
 * Semantics the parser computes are typed fields on their parts (e.g.
 * `refusal`, `reasoning`, `invalid`); `providerMetadata` preserves every raw
 * provider field that the canonical part did not consume, plus parser-derived
 * provider payloads such as unified citations.
 * Part types encode what a consumer can do with a part; new provider
 * concepts start as providerMetadata and get promoted to a typed field once
 * they are cross-provider semantics we compute and consumers filter on.
 */
export type NormalizedPartBase = {
  providerMetadata?: JsonObject;
};

export type TextPart = NormalizedPartBase & {
  type: "text";
  /** Model refusal text (OpenAI refusal parts / `message.refusal`) — stays
   * in the conversation stream, filterable for evals. */
  refusal?: true;
  text: string;
};

/**
 * One reasoning part type with a discriminated payload instead of
 * per-provider part types (mirrors FilePart.content):
 * - `text` — visible chain-of-thought or summaries; Anthropic's integrity
 *   `signature` rides on it since it certifies exactly that text.
 * - `redacted` — a blob the provider withheld (Anthropic redacted_thinking).
 * - `encrypted` — a blob the provider returns for replay (OpenAI Responses
 *   encrypted_content).
 * - `data` — structured/unrecognized reasoning payloads.
 * Opaque blobs are first-class stream elements rather than providerMetadata
 * piggybacks so replay and audit consumers can find them.
 */
export type ReasoningPart = NormalizedPartBase & {
  type: "reasoning";
  content:
    | { kind: "text"; text: string; signature?: string }
    | { kind: "redacted"; data: string }
    | { kind: "encrypted"; data: string }
    | { kind: "data"; value: JsonValue };
};

export type ToolCallPart = NormalizedPartBase & {
  type: "tool-call";
  toolCallId: string | null;
  toolName: string;
  input: JsonValue;
  /** Raw source type used by compatibility projections (for example
   * `function`, `custom`, or a provider-specific built-in kind). */
  toolType?: string;
  providerExecuted?: boolean;
  /** Attempt the model made whose arguments could not be parsed (e.g.
   * LangChain invalid_tool_calls). Visible in the stream, filterable for
   * evals; excluded from the tool columns, which count executable calls. */
  invalid?: true;
};

export type ToolResultPart = NormalizedPartBase & {
  type: "tool-result";
  toolCallId: string | null;
  toolName?: string;
  output: JsonValue;
  isError?: boolean;
};

export type FilePart = NormalizedPartBase & {
  type: "file";
  /**
   * IANA media type when the source declares one (data-URI prefix, Langfuse
   * media reference token, explicit format field). Modality wildcards like
   * `image/*` / `audio/*` when only the part kind reveals the modality;
   * absent when the source gives no signal (e.g. an opaque file id).
   */
  mediaType?: string;
  filename?: string;
  /** File was produced as reasoning output (e.g. AI SDK reasoning-file). */
  reasoning?: true;
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

export type NormalizedMessageRole = "system" | "user" | "assistant" | "tool";

/**
 * How the model's turn ended, canonicalized across providers so consumers
 * filter one vocabulary (e.g. "all length-truncated observations"). `raw`
 * keeps the provider's verbatim value, so canonicalization loses nothing
 * (e.g. { type: "stop", raw: "stop_sequence" } vs natural completion).
 */
export type FinishReason = {
  type:
    | "stop"
    | "length"
    | "tool-calls"
    | "content-filter"
    | "error"
    | "other"
    | "unknown";
  raw: string;
};

export type NormalizedMessage = {
  id?: string;
  role: NormalizedMessageRole;
  /**
   * Sender identity beyond the canonical role: an explicit participant name
   * (OpenAI/LangChain `name`, e.g. `alice` or `example_user`) or the raw
   * declared role when it is not a recognized role (e.g. multi-agent frameworks
   * putting the agent name in the role field)
   */
  senderName?: string;
  parts: NormalizedMessagePart[];
  // Turn metadata, not conversation content — a message field rather than a
  // part so text extraction, rendering, and tool-column paths stay untouched.
  finishReason?: FinishReason;
  // Preserves the observation input/output boundary in one ordered stream.
  source: "input" | "output";
};

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
