import { z } from "zod";

export const ChatMlMessageSchema = z
  .object({
    role: z.string().optional(),
    name: z.string().optional(),
    content: z
      .union([z.record(z.any()), z.string(), z.array(z.any())])
      .nullish(),
    additional_kwargs: z.record(z.any()).optional(),
  })
  .passthrough()
  .refine((value) => value.content !== null || value.role !== undefined)
  .transform(({ additional_kwargs, ...other }) => ({
    ...other,
    ...additional_kwargs,
  }))
  .transform(({ role, name, content, ...other }) => ({
    role,
    name,
    content,
    json: Object.keys(other).length === 0 ? undefined : other,
  }));

export const ChatMlArraySchema = z.array(ChatMlMessageSchema).min(1);
