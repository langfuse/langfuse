import { auditLog } from "@/src/features/audit-logs/server";
import { BatchEvaluationService } from "@/src/features/batch-actions/server/batchEvaluationService";
import { ActionId } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type { ServerContext } from "../../types";

export function createMcpBatchEvaluationService(context: ServerContext) {
  return new BatchEvaluationService(prisma, (batchAction) =>
    auditLog({
      action: ActionId.ObservationBatchEvaluation,
      resourceType: "batchAction",
      resourceId: batchAction.id,
      projectId: context.projectId,
      orgId: context.orgId,
      apiKeyId: context.apiKeyId,
      after: batchAction,
    }),
  );
}
