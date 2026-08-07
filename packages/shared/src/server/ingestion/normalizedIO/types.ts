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

export type NormalizedMessagePart = {
  type: string;
  [key: string]: unknown;
};

export type NormalizedMessage = {
  role: string;
  parts: NormalizedMessagePart[];
};

export type ToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  type?: string;
  providerMetadata?: Record<string, unknown>;
};

export type NormalizedIO = {
  // Input messages followed by output messages. Message and part order is preserved.
  messages: NormalizedMessage[];
  toolDefinitions: ToolDefinition[];
};
