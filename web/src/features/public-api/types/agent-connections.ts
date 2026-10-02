import { z } from "zod";

export const PostAgentConnectionBody = z
  .object({
    provider: z.literal("slack"),
    workspaceId: z
      .string()
      .regex(/^T[A-Z0-9]+$/)
      .max(100),
    externalUserId: z
      .string()
      .regex(/^[UW][A-Z0-9]+$/)
      .max(100),
  })
  .strict();

export const AgentConnectionResponse = z.object({
  connectionId: z.string(),
  userId: z.string().nullable(),
  linkUrl: z.url().nullable(),
});
