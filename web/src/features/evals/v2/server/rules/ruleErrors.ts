import {
  InvalidRequestError,
  LangfuseConflictError,
  EvalTargetObject,
} from "@langfuse/shared";
import {
  type PrismaClient,
  type Prisma,
  JobConfigState,
} from "@langfuse/shared/src/db";

/**
 * Enforced for every surface (tRPC, MCP, public API) through this shared guard,
 * so the documented contract cannot drift per entry point.
 */
export function assertEnabledRuleHasAssignments(params: {
  enabled: boolean;
  assignmentCount: number;
}) {
  if (params.enabled && params.assignmentCount === 0) {
    throw new InvalidRequestError(
      "An enabled evaluation rule requires at least one evaluator assignment",
    );
  }
}

/**
 * Cap on simultaneously active evaluation rules per project. Enforced for every
 * surface (tRPC, MCP, public API) through `assertActiveRuleLimitNotExceeded`, so
 * the documented contract cannot drift per entry point.
 */
export const MAX_ACTIVE_EVALUATION_RULES = 500;

export class ActiveEvaluationRuleLimitError extends LangfuseConflictError {
  readonly limit = MAX_ACTIVE_EVALUATION_RULES;

  constructor() {
    super(
      `This project already has the maximum number of active evaluation rules (${MAX_ACTIVE_EVALUATION_RULES}). Disable an existing active evaluation rule before enabling another one.`,
    );
  }
}

/**
 * Counted over the writable targets only: legacy trace and dataset rules are
 * read-only through these surfaces and are being migrated away, so they must not
 * consume a slot callers cannot free.
 */
export async function countActiveEvaluationRules(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  projectId: string;
}) {
  return params.prisma.evaluationRule.count({
    where: {
      projectId: params.projectId,
      targetObject: {
        in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
      },
      status: JobConfigState.ACTIVE,
    },
  });
}

/**
 * @param additionalActiveRules how many rules the caller is about to activate.
 */
export async function assertActiveRuleLimitNotExceeded(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  projectId: string;
  additionalActiveRules: number;
}) {
  if (params.additionalActiveRules <= 0) return;
  const activeCount = await countActiveEvaluationRules(params);
  if (
    activeCount + params.additionalActiveRules >
    MAX_ACTIVE_EVALUATION_RULES
  ) {
    throw new ActiveEvaluationRuleLimitError();
  }
}
