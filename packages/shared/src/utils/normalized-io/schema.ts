import { z } from "zod";
import type { JsonValue } from "./types";

// Pins inferred and emitted types to the public JSON type instead of Zod's
// internal JSONType, on both the input and the output side.
const jsonValueSchema: z.ZodType<JsonValue, JsonValue> = z.json();

/**
 * Semantics the parser computes are typed fields on their parts (for example
 * `refusal`, `reasoning`, `invalid`). `providerMetadata` preserves every raw
 * provider field the canonical part did not consume, plus parser-derived
 * provider payloads such as unified citations. New provider concepts start in
 * `providerMetadata` and are promoted to a typed field once they are
 * cross-provider semantics that consumers filter on.
 */
export const normalizedPartBaseSchema = z.object({
  /** Raw provider fields the canonical part did not consume, plus derived payloads such as citations. */
  providerMetadata: z.record(z.string(), jsonValueSchema).optional(),
});

export const textPartSchema = normalizedPartBaseSchema.extend({
  type: z.literal("text"),
  text: z.string(),
  /**
   * Model refusal text (OpenAI refusal parts, `message.refusal`). Stays in the
   * conversation stream and is filterable for evals.
   */
  refusal: z.literal(true).optional(),
});

/**
 * One reasoning part with a discriminated payload instead of per-provider part
 * types, mirroring file content:
 * - `text`: visible chain-of-thought or summaries; Anthropic's integrity
 *   `signature` rides along because it certifies exactly that text.
 * - `redacted`: a blob the provider withheld (Anthropic redacted_thinking).
 * - `encrypted`: a blob the provider returns for replay (OpenAI Responses
 *   encrypted_content).
 * - `data`: structured or unrecognized reasoning payloads.
 * Opaque blobs are first-class stream elements rather than providerMetadata
 * piggybacks so replay and audit consumers can find them.
 */
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
  /**
   * IANA media type when the source declares one (data-URI prefix, Langfuse
   * media reference token, explicit format field). A modality wildcard such as
   * `image/*` when only the part kind reveals the modality. Absent when the
   * source gives no signal, for example an opaque file id.
   */
  mediaType: z.string().optional(),
  filename: z.string().optional(),
  /** File produced as reasoning output (for example AI SDK reasoning-file). */
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
  /**
   * Raw source type used by compatibility projections, for example `function`,
   * `custom`, or a provider-specific built-in kind.
   */
  toolType: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  /**
   * Attempt the model made whose arguments could not be parsed (for example
   * LangChain invalid_tool_calls). Visible in the stream and filterable for
   * evals; excluded from the tool columns, which count executable calls.
   */
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

/**
 * How the model's turn ended, canonicalized across providers so consumers
 * filter one vocabulary (for example "all length-truncated observations").
 * `raw` keeps the provider's verbatim value, so canonicalization loses nothing
 * (`{ type: "stop", raw: "stop_sequence" }` versus natural completion).
 */
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
  /**
   * Sender identity beyond the canonical role: an explicit participant name
   * (OpenAI/LangChain `name`, for example `alice` or `example_user`) or the raw
   * declared role when it is not a recognized role, as multi-agent frameworks
   * do when they put the agent name in the role field.
   */
  senderName: z.string().optional(),
  parts: z.array(normalizedMessagePartSchema),
  /**
   * Turn metadata, not conversation content: a message field rather than a part
   * so text extraction, rendering and tool-column paths stay untouched.
   */
  finishReason: finishReasonSchema.optional(),
  /** Preserves the observation input/output boundary in one ordered stream. */
  source: z.enum(["input", "output"]),
});
