import { BaseChatMlMessageSchema } from "@langfuse/shared";
import { z } from "zod/v4";

export const ChatMlMessageSchema = BaseChatMlMessageSchema.refine(
  (value) => value.content !== null || value.role !== undefined,
)
  .transform(({ additional_kwargs, ...other }) => ({
    ...other,
    ...additional_kwargs,
  }))
  .transform(
    ({
      role,
      name,
      content,
      audio,
      type,
      tools,
      tool_calls,
      tool_call_id,
      ...other
    }) => ({
      role,
      name,
      content,
      audio,
      type,
      tools,
      tool_calls,
      tool_call_id,
      ...(Object.keys(other).length === 0 ? {} : { json: other }),
    }),
  );
export type ChatMlMessageSchema = z.infer<typeof ChatMlMessageSchema>;

export const ChatMlArraySchema = z.array(ChatMlMessageSchema).min(1);
export type ChatMlArraySchema = z.infer<typeof ChatMlArraySchema>;
