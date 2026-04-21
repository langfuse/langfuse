import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  DeleteLlmConnectionV1Query,
  DeleteLlmConnectionV1Response,
} from "@/src/features/public-api/types/llm-connections";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  EvaluatorBlockReason,
  getEvaluatorBlockMetadata,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import {
  blockEvaluatorConfigsInTx,
  EvaluatorBlockSource,
  finalizeBlockedEvaluatorConfigBlocks,
} from "@langfuse/shared/src/server";

export default withMiddlewares({
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete LLM Connection",
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

        const providerBlockedJobConfigIds = new Set<string>();
        const defaultModelBlockedJobConfigIds = new Set<string>();

        if (llmApiKey.provider) {
          const evalTemplates = await tx.evalTemplate.findMany({
            where: {
              OR: [{ projectId }, { projectId: null }],
              provider: llmApiKey.provider,
            },
            select: { id: true },
          });

          const providerBlockResult = await blockEvaluatorConfigsInTx({
            tx,
            projectId,
            where: {
              evalTemplateId: {
                in: evalTemplates.map((template) => template.id),
              },
            },
            blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
            blockMessage: getEvaluatorBlockMetadata(
              EvaluatorBlockReason.LLM_CONNECTION_MISSING,
            ).message,
          });

          for (const configId of providerBlockResult.blockedJobConfigIds) {
            providerBlockedJobConfigIds.add(configId);
          }
        }

        if (defaultModel && defaultModel.llmApiKeyId === llmApiKey.id) {
          const evalTemplates = await tx.evalTemplate.findMany({
            where: {
              OR: [{ projectId }, { projectId: null }],
              provider: null,
              model: null,
            },
            select: { id: true },
          });

          const defaultModelBlockResult = await blockEvaluatorConfigsInTx({
            tx,
            projectId,
            where: {
              evalTemplateId: {
                in: evalTemplates.map((template) => template.id),
              },
            },
            blockReason: EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING,
            blockMessage: getEvaluatorBlockMetadata(
              EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING,
            ).message,
          });

          for (const configId of defaultModelBlockResult.blockedJobConfigIds) {
            defaultModelBlockedJobConfigIds.add(configId);
          }
        }

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

        return {
          providerBlockedJobConfigIds: Array.from(providerBlockedJobConfigIds),
          defaultModelBlockedJobConfigIds: Array.from(
            defaultModelBlockedJobConfigIds,
          ),
        };
      });

      await finalizeBlockedEvaluatorConfigBlocks({
        projectId,
        source: EvaluatorBlockSource.LLM_API_KEY_DELETION,
        blockedByReason: {
          [EvaluatorBlockReason.LLM_CONNECTION_MISSING]:
            result.providerBlockedJobConfigIds,
          [EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING]:
            result.defaultModelBlockedJobConfigIds,
        },
      });

      return {
        message: "LLM connection successfully deleted" as const,
      };
    },
  }),
});
