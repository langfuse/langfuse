import { prisma } from "@langfuse/shared/src/db";
import {
  submitFeedback,
  type FeedbackReporter,
} from "@/src/features/feedback/server/FeedbackService";
import { PostFeedbackBody } from "@/src/features/public-api/types/feedback";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

// In-app-agent keys are minted per run for the signed-in user. Regular API
// keys may also have a creator, but that person is not the MCP caller.
const resolveInAppAgentFeedbackReporter = async ({
  apiKeyId,
  projectId,
}: {
  apiKeyId: string;
  projectId: string;
}): Promise<FeedbackReporter | undefined> => {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: apiKeyId, projectId },
    select: {
      isInAppAgentKey: true,
      createdByUser: {
        select: { id: true, email: true },
      },
    },
  });

  if (!apiKey?.isInAppAgentKey || !apiKey.createdByUser) {
    return undefined;
  }

  return {
    userId: apiKey.createdByUser.id,
    email: apiKey.createdByUser.email,
  };
};

export const [submitFeedbackTool, handleSubmitFeedback] = defineTool({
  name: "submitFeedback",
  description: [
    "Submit explicit user-approved feedback to the Langfuse team about Langfuse skills, MCP tools, CLI, docs, or public API.",
    "Before calling, ask the user for permission and show the exact feedback payload, including any optional goal/use-case context.",
    "If the user wants a reply, ask them to include their email address in the feedback text; only use an address they explicitly provide and show it in the exact payload preview.",
    "Do not include secrets, credentials, customer/project data, trace payloads, or unrelated context; the only contact detail to include is an explicitly provided reply email.",
  ].join("\n"),
  baseSchema: PostFeedbackBody,
  inputSchema: PostFeedbackBody,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.feedback.submit",
      context,
      attributes: {
        "mcp.feedback_target_type": input.targetType,
      },
      fn: async () => {
        const reporter = context.inAppAgent
          ? await resolveInAppAgentFeedbackReporter({
              apiKeyId: context.apiKeyId,
              projectId: context.projectId,
            })
          : undefined;

        return await submitFeedback({
          input,
          source: context.inAppAgent ? "in-app-assistant" : "langfuse-mcp",
          reporter,
          scope: {
            projectId: context.projectId,
            orgId: context.orgId,
            accessLevel: "project",
            plan: context.plan,
            rateLimitOverrides: context.rateLimitOverrides,
            apiKeyId: context.apiKeyId,
            publicKey: context.publicKey,
            isIngestionSuspended: false,
          },
        });
      },
    }),
});
