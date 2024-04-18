import { z } from "zod";
import { jsonSchema } from "@/src/utils/zod";
import type { Prompt } from "@langfuse/shared";

export const ChatMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

export enum PromptType {
  Chat = "chat",
  Text = "text",
}

export const CreateTextPromptSchema = z.object({
  name: z.string(),
  isActive: z.boolean(),
  type: z.literal(PromptType.Text).optional(),
  prompt: z.string(),
  config: jsonSchema.nullable().default({}),
});

export const CreateChatPromptSchema = z.object({
  name: z.string(),
  isActive: z.boolean(),
  type: z.literal(PromptType.Chat),
  prompt: z.array(ChatMessageSchema),
  config: jsonSchema.nullable().default({}),
});

export const CreatePromptSchema = z.union([
  CreateTextPromptSchema,
  CreateChatPromptSchema,
]);

export type CreatePromptType = z.infer<typeof CreatePromptSchema>;

// TRPC route requires projectId
const CreateTextPromptTRPCSchema = CreateTextPromptSchema.extend({
  projectId: z.string(),
});
const CreateChatPromptTRPCSchema = CreateChatPromptSchema.extend({
  projectId: z.string(),
});
export const CreatePromptTRPCSchema = z.union([
  CreateTextPromptTRPCSchema,
  CreateChatPromptTRPCSchema,
]);

export type CreatePromptTRPCType = z.infer<typeof CreatePromptTRPCSchema>;

export const GetPromptSchema = z.object({
  name: z.string().transform((v) => decodeURIComponent(v)),
  version: z.coerce.number().int().nullish(),
});

export const TextPromptSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  projectId: z.string(),
  createdBy: z.string(),
  version: z.number(),
  name: z.string(),
  isActive: z.boolean(),
  tags: z.array(z.string()),
  type: z.literal(PromptType.Text),
  prompt: z.string(),
  config: jsonSchema,
});

export type TextPromptType =
  z.infer<typeof TextPromptSchema> extends Prompt
    ? z.infer<typeof TextPromptSchema>
    : never;

export const ChatPromptSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  projectId: z.string(),
  createdBy: z.string(),
  version: z.number(),
  name: z.string(),
  tags: z.array(z.string()),
  isActive: z.boolean(),
  type: z.literal(PromptType.Chat),
  prompt: z.array(ChatMessageSchema),
  config: jsonSchema,
});

export type ChatPromptType =
  z.infer<typeof ChatPromptSchema> extends Prompt
    ? z.infer<typeof ChatPromptSchema>
    : never;

export const PromptSchema = z.union([TextPromptSchema, ChatPromptSchema]);
export type ValidatedPrompt = z.infer<typeof PromptSchema>;
