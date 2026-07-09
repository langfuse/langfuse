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
    targetType: FeedbackTargetType.describe("What the feedback is about."),
    target: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe(
        "Specific skill, MCP tool, CLI command, API endpoint, or docs page.",
      ),
    feedback: z
      .string()
      .trim()
      .min(1)
      .max(3000)
      .describe("The concise feedback text approved by the user."),
    goal: z
      .string()
      .trim()
      .min(1)
      .max(1500)
      .optional()
      .describe(
        "Optional user-approved goal or use case they were trying to achieve. Do not infer or add secrets, customer data, trace payloads, or broad unrelated context.",
      ),
    referenceUrl: z
      .url()
      .max(2048)
      .optional()
      .describe("Optional URL reference. Langfuse stores it as text only."),
  })
  .strict();

export const PostFeedbackResponse = z.object({ id: z.uuid() }).strict();

export type PostFeedbackBodyType = z.infer<typeof PostFeedbackBody>;
export type PostFeedbackResponseType = z.infer<typeof PostFeedbackResponse>;
