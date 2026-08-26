import { auditLog } from "@/src/features/audit-logs/auditLog";
import { EvaluatorService } from "@/src/features/evals/v2/server/evaluators/evaluatorService";
import { prisma } from "@langfuse/shared/src/db";
import type { ServerContext } from "../../types";

export function createMcpEvaluatorService(context: ServerContext) {
  return new EvaluatorService(prisma, ({ action, evaluatorId }) =>
    auditLog({
      action,
      resourceType: "evalTemplate",
      resourceId: evaluatorId,
      projectId: context.projectId,
      orgId: context.orgId,
      apiKeyId: context.apiKeyId,
    }),
  );
}
