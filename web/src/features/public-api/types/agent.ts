import { z } from "zod";
import { InAppAgentRunStatusSchema } from "@langfuse/shared/in-app-agent";

export const PostAgentRunBody = z
  .object({
    message: z.string().trim().min(1).max(32_000),
    conversationId: z
      .string()
      .regex(/^aconv_api_[a-f0-9]{64}_[a-f0-9]{64}$/)
      .optional(),
    idempotencyKey: z.string().min(1).max(200),
    connectionId: z.string().min(1).max(200),
  })
  .strict();

export const AgentRunQuery = z.object({
  runId: z.string().regex(/^arun_api_[a-f0-9]{64}$/),
  connectionId: z.string().min(1).max(200),
});

export const AgentRunReference = z.object({
  runId: z.string(),
  conversationId: z.string(),
});

export const GetAgentRunResponse = AgentRunReference.extend({
  status: InAppAgentRunStatusSchema,
  text: z.string().nullable(),
  errorCode: z.string().nullable(),
  cancelRequested: z.boolean(),
});
