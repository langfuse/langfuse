import { z } from "zod";
import {
  ChatMessageType,
  PlaceholderMessageSchema,
  PromptChatMessageListSchema,
  PromptNameSchema,
  TextPromptContentSchema,
  COMMIT_MESSAGE_MAX_LENGTH,
  PromptType,
} from "@langfuse/shared";

export const createNewPromptFormSchema = (messages: {
  isActiveRequired: string;
  invalidConfig: string;
  invalidPlaceholder: string;
  emptyMessage: string;
}) => {
  const baseSchema = z.object({
    name: PromptNameSchema,
    isActive: z.boolean({ error: messages.isActiveRequired }),
    config: z.string().refine(validateJson, messages.invalidConfig),
    commitMessage: z
      .string()
      .trim()
      .max(COMMIT_MESSAGE_MAX_LENGTH)
      .transform((val) => (val === "" ? undefined : val))
      .optional(),
  });

  const chatSchema = baseSchema.extend({
    type: z.literal(PromptType.Chat),
    chatPrompt: z
      .array(z.any())
      .refine(
        (chatMessages: Array<{ type?: ChatMessageType; content?: string }>) =>
          chatMessages.every((message) => {
            const isPlaceholder = message?.type === ChatMessageType.Placeholder;
            return (
              !isPlaceholder ||
              PlaceholderMessageSchema.safeParse(message).success
            );
          }),
        messages.invalidPlaceholder,
      )
      .refine(
        (chatMessages: Array<{ type?: ChatMessageType; content?: string }>) =>
          chatMessages.every((message) => {
            const isPlaceholder = message?.type === ChatMessageType.Placeholder;
            return isPlaceholder || Boolean(message?.content?.trim()?.length);
          }),
        messages.emptyMessage,
      ),
    textPrompt: z.string(),
  });

  const textSchema = baseSchema.extend({
    type: z.literal(PromptType.Text),
    chatPrompt: z.array(z.any()),
    textPrompt: TextPromptContentSchema,
  });

  return z.discriminatedUnion("type", [chatSchema, textSchema]);
};

export type NewPromptFormSchemaType = z.infer<
  ReturnType<typeof createNewPromptFormSchema>
>;

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
  } catch (_e) {
    return false;
  }
}
