import { z } from "zod/v4";

// OpenAI API Content Schema defined as per https://platform.openai.com/docs/api-reference/chat/create#chat-create-messages, 28.04.2025
const OpenAITextContentPart = z.object({
  type: z.union([
    z.literal("text"),
    z.literal("input_text"),
    z.literal("output_text"),
  ]),
  text: z.string(),
});
export type OpenAITextContentPartType = z.infer<typeof OpenAITextContentPart>;

export const OpenAIUrlImageUrl = z.string().regex(/^https?:/);

export const ParsedMediaReferenceSchema = z.object({
  type: z.string(),
  id: z.string(),
  source: z.string(),
  referenceString: z.string(),
});
export type ParsedMediaReferenceType = z.infer<
  typeof ParsedMediaReferenceSchema
>;

export const MediaReferenceStringSchema = z
  .string()
  .transform((str, ctx) => {
    // @@@langfuseMedia:type=image/jpeg|id=cc48838a-3da8-4ca4-a007-2cf8df930e69|source=base64@@@
    const magicStringPattern = /^@@@langfuseMedia:(.*)@@@$/;

    const match = str.match(magicStringPattern);
    if (!match) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid langfuseMedia magic string format",
      });
      return z.NEVER;
    }

    const content = match[1];
    const parts = content.split("|").filter(Boolean);

    const metadata: Record<string, string> = {
      referenceString: str,
    };

    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key && value !== undefined) {
        metadata[key.trim()] = value.trim();
      } else {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid key-value pair: ${part}`,
        });
        return z.NEVER;
      }
    }
    return metadata;
  })
  .pipe(ParsedMediaReferenceSchema);

const OpenAIBase64ImageUrl = z
  .string()
  .regex(/^data:image\/(png|jpeg|jpg|gif|webp);base64,/);

const OpenAIImageContentPart = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.union([
      OpenAIUrlImageUrl,
      MediaReferenceStringSchema,
      OpenAIBase64ImageUrl,
    ]),
    detail: z.enum(["low", "high", "auto"]).optional(), // Controls how the model processes the image. Defaults to "auto". [https://platform.openai.com/docs/guides/vision/low-or-high-fidelity-image-understanding]
  }),
});
export type OpenAIImageContentPartType = z.infer<typeof OpenAIImageContentPart>;

const OpenAIInputAudioContentPart = z.object({
  type: z.literal("input_audio"),
  input_audio: z.object({
    data: MediaReferenceStringSchema,
  }),
});

const OpenAIOutputAudioSchema = z.object({
  data: MediaReferenceStringSchema,
  transcript: z.string().optional(),
});
export type OpenAIOutputAudioType = z.infer<typeof OpenAIOutputAudioSchema>;

export const OpenAIContentParts = z.array(
  z.union([
    OpenAITextContentPart,
    OpenAIImageContentPart,
    OpenAIInputAudioContentPart,
  ]),
);

export const OpenAIContentSchema = z
  .union([z.string(), OpenAIContentParts])
  .nullable();
export type OpenAIContentSchema = z.infer<typeof OpenAIContentSchema>;

export const ChatMlMessageSchema = z
  .object({
    role: z.string().optional(),
    name: z.string().optional(),
    content: z
      .union([
        z.record(z.string(), z.any()),
        z.string(),
        z.array(z.any()),
        OpenAIContentSchema,
      ])
      .nullish(),
    audio: OpenAIOutputAudioSchema.optional(),
    additional_kwargs: z.record(z.string(), z.any()).optional(),
  })
  .passthrough()
  .refine((value) => value.content !== null || value.role !== undefined)
  .transform(({ additional_kwargs, ...other }) => ({
    ...other,
    ...additional_kwargs,
  }))
  .transform(({ role, name, content, audio, type, ...other }) => ({
    role,
    name,
    content,
    audio,
    type,
    ...(Object.keys(other).length === 0 ? {} : { json: other }),
  }));
export type ChatMlMessageSchema = z.infer<typeof ChatMlMessageSchema>;

export const ChatMlArraySchema = z.array(ChatMlMessageSchema).min(1);
export type ChatMlArraySchema = z.infer<typeof ChatMlArraySchema>;

// Typeguards to help with type inference in components
export const isOpenAITextContentPart = (
  content: any,
): content is z.infer<typeof OpenAITextContentPart> => {
  return OpenAITextContentPart.safeParse(content).success;
};

export const isOpenAIImageContentPart = (
  content: any,
): content is z.infer<typeof OpenAIImageContentPart> => {
  return OpenAIImageContentPart.safeParse(content).success;
};
