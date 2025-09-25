import { z } from "zod/v4";
import {
  ChatMlArraySchema,
  type ChatMlMessageSchema,
} from "@/src/components/schemas/ChatMlSchema";
import {
  LANGGRAPH_NODE_TAG,
  LANGGRAPH_STEP_TAG,
} from "@/src/features/trace-graph-view/types";
import { ChatMessageRole } from "@langfuse/shared";

export function mapToChatMl(
  input: unknown,
): ReturnType<typeof ChatMlArraySchema.safeParse> {
  let result = ChatMlArraySchema.safeParse(input);
  if (result.success) {
    return result;
  }

  // Check if input is an array of length 1 including an array of ChatMlMessageSchema
  // This is the case for some integrations
  // e.g. [[ChatMlMessageSchema, ...]]
  const inputArray = z.array(ChatMlArraySchema).safeParse(input);
  if (inputArray.success && inputArray.data.length === 1) {
    return ChatMlArraySchema.safeParse(inputArray.data[0]);
  }

  // Check if input is an object with a messages key
  // This is the case for some integrations
  // e.g. { messages: [ChatMlMessageSchema, ...] }
  const inputObject = z
    .object({
      messages: ChatMlArraySchema,
    })
    .safeParse(input);

  if (inputObject.success) {
    return ChatMlArraySchema.safeParse(inputObject.data.messages);
  }

  return result; // Return the original failed parse result
}

export function mapOutputToChatMl(
  output: unknown,
): ReturnType<typeof ChatMlArraySchema.safeParse> {
  const result = ChatMlArraySchema.safeParse(
    Array.isArray(output) ? output : [output],
  );

  return result;
}

/**
 * Cleans legacy completion format output for display
 * handles {completion: string} -> string transformation
 */
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

/**
 * Extracts additional input fields beyond the messages array
 * Returns raw additionalInput (may be empty object) - filtering done at usage site
 */
export function extractAdditionalInput(
  input: unknown,
): Record<string, unknown> | undefined {
  const additionalInput =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? Object.fromEntries(
          Object.entries(input as object).filter(([key]) => key !== "messages"),
        )
      : undefined;

  // Return raw result - filtering (Object.keys().length > 0) done at usage site
  return additionalInput;
}

/**
 * Combines input and output messages into a single chat conversation
 * NOTE: Original only calls this when inputResult.success === true
 */
export function combineInputOutputMessages(
  inputResult: ReturnType<typeof mapToChatMl>,
  outputResult: ReturnType<typeof mapOutputToChatMl>,
  cleanOutput: unknown,
): ChatMlMessageSchema[] {
  // IMPORTANT: Original only calls this function when inputResult.success === true
  // So we can safely assume inputResult.data exists
  if (!inputResult.success) {
    // Return empty array to prevent crash - this should never happen in normal usage
    return [];
  }

  const combinedMessages = [
    ...inputResult.data, // Original assumes success, so no conditional here
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

/**
 * Framework detection: Is LangGraph Trace?
 * If so, we recognise roles as tool names
 */
export function isLangGraphTrace(generation: {
  metadata: string | null;
}): boolean {
  if (!generation.metadata) return false;

  try {
    let metadata = generation.metadata;
    if (typeof metadata === "string") {
      metadata = JSON.parse(metadata);
    }

    if (typeof metadata === "object" && metadata !== null) {
      return LANGGRAPH_NODE_TAG in metadata || LANGGRAPH_STEP_TAG in metadata;
    }
  } catch {
    // Ignore JSON parsing errors
  }

  return false;
}

/**
 * Normalize LangGraph tool messages by converting tool-name roles to "tool"
 * and normalize Google/Gemini format (model role + parts field)
 */
export function normalizeLangGraphMessage(
  message: unknown,
  isLangGraph: boolean = false,
): unknown {
  if (!message || typeof message !== "object" || !("role" in message)) {
    return message;
  }

  const msg = message as any;
  const validRoles = Object.values(ChatMessageRole);
  let normalizedMessage = { ...msg };

  // convert google format: "model" role -> "assistant"
  if (msg.role === "model") {
    normalizedMessage.role = ChatMessageRole.Assistant;
  }

  // convert google format: "parts" field -> "content" field
  if (msg.parts && Array.isArray(msg.parts)) {
    const content = msg.parts
      .map((part: any) =>
        typeof part === "object" && part.text ? part.text : String(part),
      )
      .join("");
    normalizedMessage.content = content;
    delete normalizedMessage.parts;
  }

  // convert LangGraph: invalid roles -> "tool" role
  if (
    isLangGraph &&
    !validRoles.includes(normalizedMessage.role as ChatMessageRole)
  ) {
    return {
      ...normalizedMessage,
      role: ChatMessageRole.Tool,
      _originalRole: msg.role,
    };
  }

  return normalizedMessage;
}
