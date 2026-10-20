import { z } from "zod";
import type { Transcript } from "../transcript/types";

// Keep persisted versions independent of changes to transcript assembly.
const partBase = {
  providerMetadata: z.record(z.string(), z.json()).optional(),
};
const textPart = z.object({
  ...partBase,
  type: z.literal("text"),
  text: z.string(),
  refusal: z.literal(true).optional(),
});
const reasoningPart = z.object({
  ...partBase,
  type: z.literal("reasoning"),
  content: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("text"),
      text: z.string(),
      signature: z.string().optional(),
    }),
    z.object({ kind: z.literal("redacted"), data: z.string() }),
    z.object({ kind: z.literal("encrypted"), data: z.string() }),
    z.object({ kind: z.literal("data"), value: z.json() }),
  ]),
});
const filePart = z.object({
  ...partBase,
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
const dataPart = z.object({
  ...partBase,
  type: z.literal("data"),
  name: z.string().optional(),
  value: z.json(),
});
const customPart = z.object({
  ...partBase,
  type: z.literal("custom"),
  kind: z.string(),
  value: z.json(),
});
const toolCallPart = z.object({
  ...partBase,
  type: z.literal("tool-call"),
  toolCallId: z.string().nullable(),
  toolName: z.string(),
  input: z.json(),
  toolType: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  invalid: z.literal(true).optional(),
});
const toolResultPart = z.object({
  ...partBase,
  type: z.literal("tool-result"),
  toolCallId: z.string().nullable(),
  toolName: z.string().optional(),
  isError: z.boolean().optional(),
  output: z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), value: z.string() }),
    z.object({ type: z.literal("json"), value: z.json() }),
    z.object({
      type: z.literal("content"),
      value: z.array(
        z.discriminatedUnion("type", [
          textPart,
          reasoningPart,
          filePart,
          dataPart,
          customPart,
        ]),
      ),
    }),
  ]),
});
const message = z.object({
  id: z.string().optional(),
  role: z.enum(["system", "user", "assistant", "tool"]),
  senderName: z.string().optional(),
  source: z.enum(["input", "output"]),
  parts: z.array(
    z.discriminatedUnion("type", [
      textPart,
      reasoningPart,
      filePart,
      dataPart,
      customPart,
      toolCallPart,
      toolResultPart,
    ]),
  ),
  finishReason: z
    .object({
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
    })
    .optional(),
});
const timestamp = z.iso
  .datetime({ offset: true })
  .transform((s) => new Date(s));
const transcriptV1 = z.object({
  threads: z.array(
    z.object({
      conversationHistory: z.array(message),
      currentTurn: z.object({
        nestingLevel: z.number().int().nonnegative(),
        observations: z.array(
          z.object({ id: z.string(), traceId: z.string() }),
        ),
        messages: z.array(
          message.extend({
            observationId: z.string(),
            traceId: z.string(),
            startTime: timestamp,
            endTime: timestamp.nullable(),
          }),
        ),
      }),
    }),
  ),
  truncated: z.literal(true).optional(),
}) satisfies z.ZodType<Transcript>;

// Add breaking versions alongside v1; deploy readers before enabling new writers.
export const traceBatchInputsSchema = z.object({
  schemaVersion: z.literal(1),
  transcript: transcriptV1.nullable(),
});
