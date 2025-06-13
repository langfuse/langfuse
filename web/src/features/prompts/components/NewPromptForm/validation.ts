import { z } from "zod/v4";
import { PromptType } from "@/src/features/prompts/server/utils/validation";
import {
  PromptChatMessageListSchema,
  TextPromptSchema,
} from "@langfuse/shared";
import { COMMIT_MESSAGE_MAX_LENGTH } from "@/src/features/prompts/constants";

const NewPromptBaseSchema = z.object({
  name: z
    .string()
    .min(1, "Enter a name")
    .regex(/^[^|]*$/, "Prompt name cannot contain '|' character"),
  isActive: z.boolean({
    error: "Enter whether the prompt should go live",
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
  chatPrompt: PromptChatMessageListSchema.refine(
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

export const NewPromptFormSchema = z.discriminatedUnion("type", [
  NewChatPromptSchema,
  NewTextPromptSchema,
]);
export type NewPromptFormSchemaType = z.infer<typeof NewPromptFormSchema>;

export const PromptVariantSchema = z.union([
  z.object({
    type: z.literal(PromptType.Chat),
    prompt: PromptChatMessageListSchema,
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
