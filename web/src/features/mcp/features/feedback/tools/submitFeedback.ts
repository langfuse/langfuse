import { submitFeedback } from "@/src/features/feedback/server/FeedbackService";
import { PostFeedbackBody } from "@/src/features/public-api/types/feedback";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [submitFeedbackTool, handleSubmitFeedback] = defineTool({
  name: "submitFeedback",
  description: [
    "Submit explicit user-approved feedback to the Langfuse team about Langfuse skills, MCP tools, CLI, docs, or public API.",
    "Before calling, ask the user for permission and show the exact feedback payload, including any optional goal/use-case context.",
    "Do not include secrets, credentials, customer data, trace payloads, or unrelated context.",
  ].join("\n"),
  baseSchema: PostFeedbackBody,
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
