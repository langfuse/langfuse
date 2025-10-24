import { z } from "zod/v4";
import {
  ChatMlArraySchema,
  type ChatMlMessageSchema,
} from "@/src/components/schemas/ChatMlSchema";

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
  const additionalInput =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? Object.fromEntries(
          Object.entries(input as object).filter(([key]) => key !== "messages"),
        )
      : undefined;

  return additionalInput;
}

export function combineInputOutputMessages(
  inputResult: ReturnType<typeof mapToChatMl>,
  outputResult: ReturnType<typeof mapOutputToChatMl>,
  cleanOutput: unknown,
): ChatMlMessageSchema[] {
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
          } as ChatMlMessageSchema,
        ]),
  ];

  return combinedMessages;
}
