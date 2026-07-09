import { z } from "zod";

export const FeedbackTargetType = z.enum([
  "skill",
  "mcp-tool",
  "cli",
  "docs",
  "public-api",
  "other",
]);

export const PostFeedbackBody = z
  .object({
    targetType: FeedbackTargetType,
    target: z.string().trim().min(1).max(200),
    feedback: z.string().trim().min(1).max(3000),
    goal: z.string().trim().min(1).max(1500).optional(),
    referenceUrl: z.url().max(2048).optional(),
  })
  .strict();

export const PostFeedbackResponse = z.object({ id: z.uuid() }).strict();

export type PostFeedbackBodyType = z.infer<typeof PostFeedbackBody>;
export type PostFeedbackResponseType = z.infer<typeof PostFeedbackResponse>;
