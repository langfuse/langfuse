import { z } from "zod";
import { PromptType } from "@/src/features/prompts/server/utils/validation";
import { ChatMessageListSchema, TextPromptSchema } from "@langfuse/shared";
import { COMMIT_MESSAGE_MAX_LENGTH } from "@/src/features/prompts/constants";

const NewPromptBaseSchema = z.object({
  name: z.string().min(1, "Enter a name"),
  isActive: z.boolean({
    required_error: "Enter whether the prompt should go live",
  }),
  config: z.string().refine(validateJson, "Config needs to be valid JSON"),
  commitMessage: z
    .string()
    .trim()
    .min(1)
    .max(COMMIT_MESSAGE_MAX_LENGTH)
    .optional(),
});

const NewChatPromptSchema = NewPromptBaseSchema.extend({
  type: z.literal(PromptType.Chat),
  chatPrompt: ChatMessageListSchema.refine(
    (messages) => messages.every((message) => message.content.length > 0),
    "Enter a chat message or remove the empty message",
  ),
  textPrompt: z.string(),
});

const NewTextPromptSchema = NewPromptBaseSchema.extend({
  type: z.literal(PromptType.Text),
  chatPrompt: z.array(z.any()),
  textPrompt: TextPromptSchema,
});

export const NewPromptFormSchema = z.union([
  NewChatPromptSchema,
  NewTextPromptSchema,
]);
export type NewPromptFormSchemaType = z.infer<typeof NewPromptFormSchema>;

export const PromptVariantSchema = z.union([
  z.object({
    type: z.literal(PromptType.Chat),
    prompt: ChatMessageListSchema,
  }),
  z.object({
    type: z.literal(PromptType.Text),
    prompt: z.string(),
  }),
]);
export type PromptVariant = z.infer<typeof PromptVariantSchema>;

function validateJson(content: string): boolean {
  try {
    JSON.parse(content);

    return true;
  } catch (e) {
    return false;
  }
}
