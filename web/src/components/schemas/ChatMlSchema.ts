import { z } from "zod";

// OpenAI API Content Schema defined as per https://platform.openai.com/docs/api-reference/chat/create#chat-create-messages, 20.08.2024
const OpenAITextContentPart = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const OpenAIUrlImageUrl = z.string().regex(/^https?:/);

const OpenAIBase64ImageUrl = z
  .string()
  .regex(/^data:image\/(png|jpeg|jpg|gif|webp);base64,/);

const OpenAIImageContentPart = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.union([OpenAIUrlImageUrl, OpenAIBase64ImageUrl]),
    detail: z.enum(["low", "high", "auto"]).optional(), // Controls how the model processes the image. Defaults to "auto". [https://platform.openai.com/docs/guides/vision/low-or-high-fidelity-image-understanding]
  }),
});

export const OpenAIContentParts = z.array(
  z.union([OpenAITextContentPart, OpenAIImageContentPart]),
);

export const OpenAIContentSchema = z.union([z.string(), OpenAIContentParts]);
export type OpenAIContentSchema = z.infer<typeof OpenAIContentSchema>;

export const ChatMlMessageSchema = z
  .object({
    role: z.string().optional(),
    name: z.string().optional(),
    content: z
      .union([
        z.record(z.any()),
        z.string(),
        z.array(z.any()),
        OpenAIContentSchema,
      ])
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
export type ChatMlMessageSchema = z.infer<typeof ChatMlMessageSchema>;

export const ChatMlArraySchema = z.array(ChatMlMessageSchema).min(1);
export type ChatMlArraySchema = z.infer<typeof ChatMlArraySchema>;
