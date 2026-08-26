/**
 * ChatML core normalization functions.
 *
 * NOTE: Moved to shared package to enable testing
 * because web can't import from worker. Also, web tests
 * can't import from shared, so tested FE logic
 */
import { z } from "zod";
import {
  ChatMlArraySchema,
  ChatMlMessageSchema,
} from "../IORepresentation/chatML/types";
import { selectAdapter, type NormalizerContext } from "./adapters";

type ChatMlMessage = z.infer<typeof ChatMlMessageSchema>;

function isSingleChatMlMessage(
  input: unknown,
): input is Record<string, unknown> {
  return (
    input !== null &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    typeof (input as Record<string, unknown>).role === "string" &&
    ("content" in input || "tool_calls" in input)
  );
}

export function mapToChatMl(
  input: unknown,
): ReturnType<typeof ChatMlArraySchema.safeParse> {
  let result = ChatMlArraySchema.safeParse(input);
  if (result.success) {
    return result;
  }

  // Check if input is an array of length 1 including an array of ChatMlMessageSchema
  // e.g. [[ChatMlMessageSchema, ...]]
  const inputArray = z.array(ChatMlArraySchema).safeParse(input);
  if (inputArray.success && inputArray.data.length === 1) {
    return ChatMlArraySchema.safeParse(inputArray.data[0]);
  }

  // Check if input is an object with a messages key
  // e.g. { messages: [ChatMlMessageSchema, ...] }
  const inputObject = z
    .object({
      messages: ChatMlArraySchema,
    })
    .safeParse(input);

  if (inputObject.success) {
    return ChatMlArraySchema.safeParse(inputObject.data.messages);
  }

  // Single message object, e.g. { role: "user", content: "..." }
  if (isSingleChatMlMessage(input)) {
    return ChatMlArraySchema.safeParse([input]);
  }

  return result;
}

export function mapOutputToChatMl(
  output: unknown,
): ReturnType<typeof ChatMlArraySchema.safeParse> {
  // Check if output has messages key (LangGraph/LangChain format)
  if (
    output &&
    typeof output === "object" &&
    !Array.isArray(output) &&
    "messages" in output
  ) {
    const obj = output as Record<string, unknown>;
    return ChatMlArraySchema.safeParse(obj.messages);
  }

  const result = ChatMlArraySchema.safeParse(
    Array.isArray(output) ? output : [output],
  );

  return result;
}

export function cleanLegacyOutput(output: unknown, fallback?: unknown) {
  const outLegacyCompletionSchema = z
    .object({
      completion: z.string(),
    })
    .refine((value) => Object.keys(value).length === 1);

  const outLegacyCompletionSchemaParsed =
    outLegacyCompletionSchema.safeParse(output);
  const outputClean = outLegacyCompletionSchemaParsed.success
    ? outLegacyCompletionSchemaParsed.data
    : (fallback ?? null);

  return outputClean;
}

export function extractAdditionalInput(
  input: unknown,
): Record<string, unknown> | undefined {
  if (isSingleChatMlMessage(input)) return undefined;

  const adapter = selectAdapter({ metadata: input, data: input });
  const consumedInputKeys = new Set(
    ["messages"].concat(adapter.getConsumedInputKeys?.(input) ?? []),
  );
  const additionalInput =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? Object.fromEntries(
          Object.entries(input as object).filter(
            ([key]) => !consumedInputKeys.has(key),
          ),
        )
      : undefined;

  return additionalInput;
}

export function combineInputOutputMessages(
  inputResult: ReturnType<typeof mapToChatMl>,
  outputResult: ReturnType<typeof mapOutputToChatMl>,
  cleanOutput: unknown,
): ChatMlMessage[] {
  if (!inputResult.success) {
    return [];
  }

  const combinedMessages = [
    ...inputResult.data,
    ...(outputResult.success
      ? outputResult.data.map((m) => ({
          ...m,
          role: m.role ?? "assistant",
        }))
      : [
          {
            role: "assistant",
            ...(typeof cleanOutput === "string"
              ? { content: cleanOutput }
              : { json: cleanOutput }),
          } as ChatMlMessage,
        ]),
  ];

  return combinedMessages;
}

/**
 * Normalize input using shared adapters with frontend schema validation.
 * Uses adapters from shared package but validates with strict frontend schema.
 */
export function normalizeInput(
  input: unknown,
  ctx: NormalizerContext = {},
): ReturnType<typeof ChatMlArraySchema.safeParse> {
  const adapter = selectAdapter({
    ...ctx,
    metadata: ctx.metadata ?? input,
    data: input,
  });
  const preprocessed = adapter.preprocess(input, "input", ctx);
  return mapToChatMl(preprocessed);
}

/**
 * Normalize output using shared adapters with frontend schema validation.
 * Uses adapters from shared package but validates with strict frontend schema.
 */
export function normalizeOutput(
  output: unknown,
  ctx: NormalizerContext = {},
): ReturnType<typeof ChatMlArraySchema.safeParse> {
  const adapter = selectAdapter({
    ...ctx,
    metadata: ctx.metadata ?? output,
    data: output,
  });
  const preprocessed = adapter.preprocess(output, "output", ctx);
  return mapOutputToChatMl(preprocessed);
}
