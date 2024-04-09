import { z } from "zod";
import { extractVariables } from "@/src/utils/string";
import { PromptType } from "@/src/features/prompts/server/validation";
import { ChatMessageRole } from "@langfuse/shared";

const ChatMessageSchema = z.object({
  role: z.nativeEnum(ChatMessageRole),
  content: z.string(),
});

export const ChatMessageListSchema = z.array(ChatMessageSchema);
export const TextPromptSchema = z
  .string()
  .min(1, "Enter a prompt")
  .refine(
    validateVariables,
    "Variables must only contain letters and underscores (_)",
  );

const NewPromptBaseSchema = z.object({
  name: z.string().min(1, "Enter a name"),
  isActive: z.boolean({
    required_error: "Enter whether the prompt should go live",
  }),
  config: z.string().refine(validateJson, "Config needs to be valid JSON"),
});

const NewChatPromptSchema = NewPromptBaseSchema.extend({
  type: z.literal(PromptType.Chat),
  chatPrompt: ChatMessageListSchema.refine(
    (messages) => messages.every((message) => message.content.length > 0),
    "Enter a chat message or remove the empty message",
  ).refine(
    (messages) => validateVariables(messages.map((m) => m.content).join("\n")),
    "Variables must only contain letters and underscores (_)",
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

export const PromptContentSchema = z.union([
  z.object({
    type: z.literal(PromptType.Chat),
    prompt: ChatMessageListSchema,
  }),
  z.object({
    type: z.literal(PromptType.Text),
    prompt: z.string(),
  }),
]);
export type PromptContentType = z.infer<typeof PromptContentSchema>;

export function getIsCharOrUnderscore(value: string): boolean {
  const charOrUnderscore = /^[A-Za-z_]+$/;

  return charOrUnderscore.test(value);
}

function validateVariables(content: string): boolean {
  return extractVariables(content).every(getIsCharOrUnderscore);
}

function validateJson(content: string): boolean {
  try {
    JSON.parse(content);

    return true;
  } catch (e) {
    return false;
  }
}
