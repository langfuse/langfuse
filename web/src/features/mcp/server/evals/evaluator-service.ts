import { auditLog } from "@/src/features/audit-logs/auditLog";
import { EvaluatorService } from "@/src/features/evals/v2/server/evaluators/evaluatorService";
import { TRACE_TRANSCRIPT_EVAL_VARIABLE_COLUMN_ID } from "@langfuse/shared";
import { prisma, type Prisma } from "@langfuse/shared/src/db";
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

function withoutTranscriptMappings(
  variableMapping: Prisma.JsonValue,
): Prisma.JsonValue {
  if (!Array.isArray(variableMapping)) return variableMapping;
  return variableMapping.filter(
    (entry) =>
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry) ||
      entry.selectedColumnId !== TRACE_TRANSCRIPT_EVAL_VARIABLE_COLUMN_ID,
  );
}

/** Drops `threads` entries from version mappings; everything else is unchanged. */
export function toMcpEvaluator<
  T extends { versions: Array<{ variableMapping: Prisma.JsonValue }> },
>(evaluator: T): T {
  return {
    ...evaluator,
    versions: evaluator.versions.map((version) => ({
      ...version,
      variableMapping: withoutTranscriptMappings(version.variableMapping),
    })),
  };
}
