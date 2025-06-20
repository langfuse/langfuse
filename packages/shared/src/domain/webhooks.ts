import { z } from "zod/v4";
import { jsonSchema } from "../utils/zod";
import { EventActionSchema } from "./automations";

// Default headers that are automatically added to webhook requests
export const WebhookDefaultHeadersSchema = z.object({
  "content-type": z.literal("application/json"),
  "User-Agent": z.literal("Langfuse/1.0"),
});

export type WebhookDefaultHeaders = z.infer<typeof WebhookDefaultHeadersSchema>;

export const WebhookOutboundBaseSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  type: z.literal("prompt"),
  action: EventActionSchema,
});

export const PromptWebhookOutboundSchema = z
  .object({
    prompt: z.object({
      id: z.string(),
      name: z.string(),
      version: z.number(),
      projectId: z.string(),
      labels: z.array(z.string()),
      prompt: jsonSchema.nullable(),
      type: z.string(),
      config: z.record(z.string(), z.any()),
      commitMessage: z.string().nullable(),
      tags: z.array(z.string()),
      createdAt: z.date(),
      updatedAt: z.date(),
    }),
  })
  .and(WebhookOutboundBaseSchema);

export type PromptWebhookOutput = z.infer<typeof PromptWebhookOutboundSchema>;
