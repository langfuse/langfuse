import {
  InvalidRequestError,
  LangfuseConflictError,
  EvalTargetObject,
  EvalTemplateType,
  TopicsTargetObject,
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
 * @internal
 */
export const MAX_ACTIVE_EVALUATION_RULES = 500;

/** @internal */
export class ActiveEvaluationRuleLimitError extends LangfuseConflictError {
  readonly limit = MAX_ACTIVE_EVALUATION_RULES;

  constructor() {
    super(
      `This project already has the maximum number of active evaluation rules (${MAX_ACTIVE_EVALUATION_RULES}). Disable an existing active evaluation rule before enabling another one.`,
    );
  }
}

/**
 * Counts only the writable targets; legacy read-only rules and FACET (Topics)
 * rules cannot be freed by callers, so they are excluded.
 * @internal
 */
export async function countActiveEvaluationRules(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  projectId: string;
}) {
  return params.prisma.evaluationRule.count({
    where: {
      projectId: params.projectId,
      status: JobConfigState.ACTIVE,
      OR: [
        {
          targetObject: {
            in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
          },
        },
        {
          targetObject: TopicsTargetObject,
          assignments: {
            none: { evaluator: { type: EvalTemplateType.FACET } },
          },
        },
      ],
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
