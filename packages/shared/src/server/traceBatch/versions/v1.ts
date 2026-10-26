import { z } from "zod";
import type { JsonValue } from "../../../utils/normalized-io/types";

/**
 * Trace-batch input format V1: a frozen envelope and copy of the transcript
 * and normalized message schemas, with message dates as ISO strings. This file
 * imports no live schema, so the live shape can change without changing what V1
 * accepts. V1 may only gain optional fields whose
 * absence is safe for old readers; anything else starts `v2.ts`.
 */

const jsonValue: z.ZodType<JsonValue, JsonValue> = z.json();

/** ISO 8601 timestamp as produced by `Date.prototype.toISOString`. */
const isoTimestampSchema = z.iso.datetime();

const partBase = z.object({
  providerMetadata: z.record(z.string(), jsonValue).optional(),
});

const textPart = partBase.extend({
  type: z.literal("text"),
  text: z.string(),
  refusal: z.literal(true).optional(),
});

const reasoningPart = partBase.extend({
  type: z.literal("reasoning"),
  content: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("text"),
      text: z.string(),
      signature: z.string().optional(),
    }),
    z.object({ kind: z.literal("redacted"), data: z.string() }),
    z.object({ kind: z.literal("encrypted"), data: z.string() }),
    z.object({ kind: z.literal("data"), value: jsonValue }),
  ]),
});

const filePart = partBase.extend({
  type: z.literal("file"),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
  reasoning: z.literal(true).optional(),
  content: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("url"), url: z.string() }),
    z.object({ kind: z.literal("base64"), data: z.string() }),
    z.object({ kind: z.literal("reference"), id: z.string() }),
  ]),
});

const dataPart = partBase.extend({
  type: z.literal("data"),
  name: z.string().optional(),
  value: jsonValue,
});

const customPart = partBase.extend({
  type: z.literal("custom"),
  kind: z.string(),
  value: jsonValue,
});

const toolCallPart = partBase.extend({
  type: z.literal("tool-call"),
  toolCallId: z.string().nullable(),
  toolName: z.string(),
  input: jsonValue,
  toolType: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  invalid: z.literal(true).optional(),
});

const toolResultContentPart = z.discriminatedUnion("type", [
  textPart,
  reasoningPart,
  filePart,
  dataPart,
  customPart,
]);

const toolResultOutput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), value: z.string() }),
  z.object({ type: z.literal("json"), value: jsonValue }),
  z.object({
    type: z.literal("content"),
    value: z.array(toolResultContentPart),
  }),
]);

const toolResultPart = partBase.extend({
  type: z.literal("tool-result"),
  toolCallId: z.string().nullable(),
  toolName: z.string().optional(),
  isError: z.boolean().optional(),
  output: toolResultOutput,
});

const messagePart = z.discriminatedUnion("type", [
  textPart,
  reasoningPart,
  toolCallPart,
  toolResultPart,
  filePart,
  dataPart,
  customPart,
]);

const finishReason = z.object({
  type: z.enum([
    "stop",
    "length",
    "tool-calls",
    "content-filter",
    "error",
    "other",
    "unknown",
  ]),
  raw: z.string(),
});

const message = z.object({
  id: z.string().optional(),
  role: z.enum(["system", "user", "assistant", "tool"]),
  senderName: z.string().optional(),
  parts: z.array(messagePart),
  finishReason: finishReason.optional(),
  source: z.enum(["input", "output"]),
});

const threadMessage = message.extend({
  observationId: z.string(),
  traceId: z.string(),
  startTime: isoTimestampSchema,
  endTime: isoTimestampSchema.nullable(),
});

const turn = z.object({
  nestingLevel: z.number().int().nonnegative(),
  messages: z.array(threadMessage),
  observations: z.array(z.object({ id: z.string(), traceId: z.string() })),
});

const thread = z.object({
  conversationHistory: z.array(message),
  currentTurn: turn,
});

/** The stored V1 transcript; the JSON constraint rejects any non-JSON field. */
const storedTranscriptV1Schema = z.object({
  threads: z.array(thread),
  truncated: z.literal(true).optional(),
}) satisfies z.ZodType<JsonValue>;

export type StoredTranscriptV1 = z.infer<typeof storedTranscriptV1Schema>;

const storedExecutionIssueV1Schema = z.object({
  observationId: z.string(),
  traceId: z.string().nullable(),
  type: z.enum([
    "SPAN",
    "EVENT",
    "GENERATION",
    "AGENT",
    "TOOL",
    "CHAIN",
    "RETRIEVER",
    "EVALUATOR",
    "EMBEDDING",
    "GUARDRAIL",
  ]),
  name: z.string().nullable(),
  level: z.enum(["ERROR", "WARNING"]),
  statusMessage: z.string().nullable(),
  startTime: isoTimestampSchema,
}) satisfies z.ZodType<JsonValue>;

export type StoredExecutionIssueV1 = z.infer<
  typeof storedExecutionIssueV1Schema
>;

// Add breaking versions alongside v1; deploy readers before enabling new writers.
export const traceBatchInputsV1Schema = z.object({
  schemaVersion: z.literal(1),
  transcript: storedTranscriptV1Schema.nullable(),
  /** Optional addition: objects written before it was added read as empty. */
  executionIssues: z.array(storedExecutionIssueV1Schema).default([]),
  // Mirrors the event observation domain fields without importing the domain
  // schema; the writer's typed assignment keeps both compatible.
  traceContext: z.object({
    sessionId: z.string().nullable(),
    traceTimestamp: isoTimestampSchema,
    environment: z.string(),
    traceName: z.string().nullable(),
  }),
}) satisfies z.ZodType<JsonValue>;

export type TraceBatchInputsV1 = z.infer<typeof traceBatchInputsV1Schema>;
