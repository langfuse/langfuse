import { z } from "zod/v4";
import { jsonSchema, jsonSchemaNullable } from "../utils/zod";
import { EventActionSchema } from "./automations";
import { ObservationLevelDomain } from "./observations";
import { MetadataDomain } from "./traces";

export const WebhookDefaultHeaders = {
  "content-type": "application/json",
  "user-agent": "Langfuse/1.0",
};

export const WebhookOutboundBaseSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  apiVersion: z.literal("v1"),
  action: EventActionSchema,
});

export const PromptWebhookOutboundSchema = z
  .object({
    type: z.literal("prompt-version"),
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
      createdAt: z.coerce.date(),
      updatedAt: z.coerce.date(),
    }),
  })
  .and(WebhookOutboundBaseSchema);

export type PromptWebhookOutput = z.infer<typeof PromptWebhookOutboundSchema>;

export const TraceWebhookOutboundSchema = z
  .object({
    type: z.literal("trace"),
    trace: z.object({
      id: z.string(),
      name: z.string().nullable(),
      timestamp: z.coerce.date(),
      environment: z.string(),
      tags: z.array(z.string()),
      bookmarked: z.boolean(),
      public: z.boolean(),
      release: z.string().nullable(),
      version: z.string().nullable(),
      input: jsonSchemaNullable,
      output: jsonSchemaNullable,
      metadata: MetadataDomain,
      createdAt: z.coerce.date(),
      updatedAt: z.coerce.date(),
      sessionId: z.string().nullable(),
      userId: z.string().nullable(),
      projectId: z.string(),
    }),
    // Optional observation context when triggered by an observation-level event
    observationLevel: ObservationLevelDomain.optional(),
    observationId: z.string().optional(),
  })
  .and(WebhookOutboundBaseSchema);

export type TraceWebhookOutput = z.infer<typeof TraceWebhookOutboundSchema>;

export const GitHubDispatchWebhookOutboundSchema = z.object({
  event_type: z.string(),
  client_payload: PromptWebhookOutboundSchema,
});

export type GitHubDispatchWebhookOutput = z.infer<
  typeof GitHubDispatchWebhookOutboundSchema
>;
