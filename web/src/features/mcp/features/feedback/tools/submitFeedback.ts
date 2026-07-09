import { z } from "zod";
import { submitFeedback } from "@/src/features/feedback/server/FeedbackService";
import { PostFeedbackBody } from "@/src/features/public-api/types/feedback";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const SubmitFeedbackBaseSchema = z
  .object({
    targetType: z
      .enum(["skill", "mcp-tool", "cli", "docs", "public-api", "other"])
      .describe("What the feedback is about."),
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
    referenceUrl: z.url().max(2048).optional(),
  })
  .strict();

export const [submitFeedbackTool, handleSubmitFeedback] = defineTool({
  name: "submitFeedback",
  description: [
    "Submit explicit user-approved feedback to the Langfuse team about Langfuse skills, MCP tools, CLI, docs, or public API.",
    "Before calling, ask the user for permission and show the exact feedback payload, including any optional goal/use-case context.",
    "Do not include secrets, credentials, customer data, trace payloads, or unrelated context.",
  ].join("\n"),
  baseSchema: SubmitFeedbackBaseSchema,
  inputSchema: PostFeedbackBody,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.feedback.submit",
      context,
      attributes: {
        "mcp.feedback_target_type": input.targetType,
        "mcp.feedback_target": input.target,
      },
      fn: async () =>
        await submitFeedback({
          input,
          authScope: {
            projectId: context.projectId,
            orgId: context.orgId,
          },
        }),
    }),
});
