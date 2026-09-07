import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  DeleteLlmConnectionV1Query,
  DeleteLlmConnectionV1Response,
} from "@/src/features/public-api/types/llm-connections";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { EvaluatorBlockReason, LangfuseNotFoundError } from "@langfuse/shared";
import {
  blockEvaluatorsUsingDefaultModel,
  blockEvaluatorsUsingProvider,
  EMPTY_EVALUATOR_BLOCK,
  EvaluatorBlockSource,
  finalizeEvaluatorBlocks,
} from "@langfuse/shared/src/server";

export default withMiddlewares({
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete LLM Connection",
    action: "llmApiKeys:delete",
    querySchema: DeleteLlmConnectionV1Query,
    responseSchema: DeleteLlmConnectionV1Response,
    isAdminApiKeyAuthAllowed: true,
    fn: async ({ query, auth }) => {
      const projectId = auth.scope.projectId;

      const llmApiKey = await prisma.llmApiKeys.findFirst({
        where: {
          id: query.id,
          projectId,
        },
      });

      if (!llmApiKey) {
        throw new LangfuseNotFoundError("LLM connection not found");
      }

      const result = await prisma.$transaction(async (tx) => {
        const defaultModel = await tx.defaultLlmModel.findFirst({
          where: { projectId },
          select: { llmApiKeyId: true },
        });

        const providerBlock = llmApiKey.provider
          ? await blockEvaluatorsUsingProvider({
              tx,
              projectId,
              provider: llmApiKey.provider,
            })
          : EMPTY_EVALUATOR_BLOCK;

        const defaultModelBlock =
          defaultModel && defaultModel.llmApiKeyId === llmApiKey.id
            ? await blockEvaluatorsUsingDefaultModel({ tx, projectId })
            : EMPTY_EVALUATOR_BLOCK;

        await tx.llmApiKeys.delete({
          where: { id: llmApiKey.id, projectId },
        });

        await auditLog({
          action: "delete",
          resourceType: "llmApiKey",
          resourceId: llmApiKey.id,
          projectId,
          orgId: auth.scope.orgId,
          apiKeyId: auth.scope.apiKeyId,
          before: llmApiKey,
        });

        return { providerBlock, defaultModelBlock };
      });

      await finalizeEvaluatorBlocks({
        projectId,
        source: EvaluatorBlockSource.LLM_API_KEY_DELETION,
        evaluatorIdsByReason: {
          [EvaluatorBlockReason.LLM_CONNECTION_MISSING]:
            result.providerBlock.blockedEvaluatorIds,
          [EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING]:
            result.defaultModelBlock.blockedEvaluatorIds,
        },
      });

      return {
        message: "LLM connection successfully deleted" as const,
      };
    },
  }),
});
