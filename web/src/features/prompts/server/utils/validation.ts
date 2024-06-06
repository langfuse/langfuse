import { z } from "zod";
import { jsonSchema } from "@langfuse/shared";
import type { Prompt } from "@langfuse/shared";

export const ChatMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

export enum PromptType {
  Chat = "chat",
  Text = "text",
}

export const PromptLabelSchema = z
  .string()
  .min(1)
  .max(20)
  .regex(
    /^[a-z0-9_\-.]+$/,
    "Label must be lowercase alphanumeric with optional underscores, hyphens, or periods",
  );

export const CreateTextPromptSchema = z.object({
  name: z.string(),
  labels: z.array(PromptLabelSchema).default([]),
  type: z.literal(PromptType.Text).optional(),
  prompt: z.string(),
  config: jsonSchema.nullable().default({}),
  tags: z.array(z.string()).nullish(),
});

export const CreateChatPromptSchema = z.object({
  name: z.string(),
  labels: z.array(PromptLabelSchema).default([]),
  type: z.literal(PromptType.Chat),
  prompt: z.array(ChatMessageSchema),
  config: jsonSchema.nullable().default({}),
  tags: z.array(z.string()).nullish(),
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

export const GetPromptsMetaSchema = z.object({
  name: z.string().optional(),
  version: z.coerce.number().int().nullish(),
  label: z.string().optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type GetPromptsMetaType = z.infer<typeof GetPromptsMetaSchema>;

export const GetPromptSchema = z.object({
  name: z.string().transform((v) => decodeURIComponent(v)),
  version: z.coerce.number().int().nullish(),
});

export const GetPromptByNameSchema = z.object({
  promptName: z.string(),
  version: z.coerce.number().int().nullish(),
  label: z.string().optional(),
});

export const TextPromptSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  projectId: z.string(),
  createdBy: z.string(),
  version: z.number(),
  name: z.string(),
  labels: z.array(PromptLabelSchema),
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
  labels: z.array(PromptLabelSchema),
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

// Backward compat for V1 prompts endpoint
export const LegacyCreatePromptSchema = z.union([
  CreateTextPromptSchema.extend({ isActive: z.boolean() }),
  CreateChatPromptSchema.extend({ isActive: z.boolean() }),
]);
export const LegacyPromptSchema = z.union([
  TextPromptSchema.extend({ isActive: z.boolean() }),
  ChatPromptSchema.extend({ isActive: z.boolean() }),
]);
export type LegacyValidatedPrompt = z.infer<typeof LegacyPromptSchema>;
