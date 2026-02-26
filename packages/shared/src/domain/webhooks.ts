import { z } from "zod/v4";
import { jsonSchema } from "../utils/zod";
import { EventActionSchema } from "./automations";

export const WebhookDefaultHeaders = {
  "content-type": "application/json",
  "user-agent": "Langfuse/1.0",
};

export const WebhookOutboundBaseSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  type: z.literal("prompt-version"),
  apiVersion: z.literal("v1"),
  action: EventActionSchema,
});

export const PromptWebhookOutboundSchema = z
  .object({
    prompt: z.object({
      id: z.string(),
      name: z.string(),
      version: z.number(),
      projectId: z.string(),
      createdBy: z.string(),
      labels: z.array(z.string()),
      prompt: jsonSchema.nullable(),
      type: z.string(),
      config: z.record(z.string(), z.any()),
      commitMessage: z.string().nullable(),
      tags: z.array(z.string()),
      createdAt: z.coerce.date(),
      updatedAt: z.coerce.date(),
    }),
    user: z
      .object({
        name: z.string().nullable(),
        email: z.string().nullable(),
      })
      .optional(),
  })
  .and(WebhookOutboundBaseSchema);

export type PromptWebhookOutput = z.infer<typeof PromptWebhookOutboundSchema>;

export const GitHubDispatchWebhookOutboundSchema = z.object({
  event_type: z.string(),
  client_payload: PromptWebhookOutboundSchema,
});

export type GitHubDispatchWebhookOutput = z.infer<
  typeof GitHubDispatchWebhookOutboundSchema
>;
