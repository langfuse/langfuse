import { z } from "zod";
import type { JsonValue } from "./types";

// Keep emitted declarations on the public JSON type instead of Zod internals.
const jsonValueSchema: z.ZodType<JsonValue> = z.json();

/** Provider fields not consumed by the canonical part, including derived citations. */
export const normalizedPartBaseSchema = z.object({
  providerMetadata: z.record(z.string(), jsonValueSchema).optional(),
});

export const textPartSchema = normalizedPartBaseSchema.extend({
  type: z.literal("text"),
  text: z.string(),
  /** Model refusal text remains in the conversation stream for evaluation. */
  refusal: z.literal(true).optional(),
});

/** Opaque reasoning remains a first-class part for replay and audit. */
export const reasoningPartSchema = normalizedPartBaseSchema.extend({
  type: z.literal("reasoning"),
  content: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("text"),
      text: z.string(),
      signature: z.string().optional(),
    }),
    z.object({ kind: z.literal("redacted"), data: z.string() }),
    z.object({ kind: z.literal("encrypted"), data: z.string() }),
    z.object({ kind: z.literal("data"), value: jsonValueSchema }),
  ]),
});

export const filePartSchema = normalizedPartBaseSchema.extend({
  type: z.literal("file"),
  /** IANA type or modality wildcard; absent when the source gives no signal. */
  mediaType: z.string().optional(),
  filename: z.string().optional(),
  /** File produced as reasoning output. */
  reasoning: z.literal(true).optional(),
  content: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("url"), url: z.string() }),
    z.object({ kind: z.literal("base64"), data: z.string() }),
    z.object({ kind: z.literal("reference"), id: z.string() }),
  ]),
});

export const dataPartSchema = normalizedPartBaseSchema.extend({
  type: z.literal("data"),
  name: z.string().optional(),
  value: jsonValueSchema,
});

export const customPartSchema = normalizedPartBaseSchema.extend({
  type: z.literal("custom"),
  kind: z.string(),
  value: jsonValueSchema,
});

export const toolCallPartSchema = normalizedPartBaseSchema.extend({
  type: z.literal("tool-call"),
  toolCallId: z.string().nullable(),
  toolName: z.string(),
  input: jsonValueSchema,
  /** Raw source type used by compatibility projections. */
  toolType: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  /** Unparseable arguments: visible for evals, excluded from executable tool columns. */
  invalid: z.literal(true).optional(),
});

/** Content belonging to one execution; nested calls/results are not content. */
export const toolResultContentPartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  reasoningPartSchema,
  filePartSchema,
  dataPartSchema,
  customPartSchema,
]);

export const toolResultOutputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), value: z.string() }),
  z.object({ type: z.literal("json"), value: jsonValueSchema }),
  z.object({
    type: z.literal("content"),
    value: z.array(toolResultContentPartSchema),
  }),
]);

export const toolResultPartSchema = normalizedPartBaseSchema.extend({
  type: z.literal("tool-result"),
  toolCallId: z.string().nullable(),
  toolName: z.string().optional(),
  isError: z.boolean().optional(),
  output: toolResultOutputSchema,
});

export const normalizedMessagePartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  reasoningPartSchema,
  toolCallPartSchema,
  toolResultPartSchema,
  filePartSchema,
  dataPartSchema,
  customPartSchema,
]);

export const normalizedMessageRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
  "tool",
]);

/** Canonical completion reason with the provider's verbatim value retained. */
export const finishReasonSchema = z.object({
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

export const normalizedMessageSchema = z.object({
  id: z.string().optional(),
  role: normalizedMessageRoleSchema,
  /** Participant name or a source role outside the canonical role vocabulary. */
  senderName: z.string().optional(),
  parts: z.array(normalizedMessagePartSchema),
  /** Turn metadata retained on the message, separate from conversation content. */
  finishReason: finishReasonSchema.optional(),
  /** Preserves the observation input/output boundary in one ordered stream. */
  source: z.enum(["input", "output"]),
});
