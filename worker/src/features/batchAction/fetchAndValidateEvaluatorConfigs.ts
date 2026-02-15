import { EvalTargetObject } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { type ObservationEvalConfig } from "../evaluation/observationEval";

/**
 * Fetches and validates evaluator configurations for a batch run-evaluation action.
 *
 * Note: This intentionally re-validates evaluators even though the tRPC layer
 * already checks them at request time. Evaluators may be deactivated or deleted
 * between when the job is queued and when the worker picks it up.
 *
 * - Queries active EVENT-scoped job configurations by the given IDs
 * - Verifies all requested evaluators exist and are active
 * - Returns them ordered to match the input `evaluatorIds` array
 *
 * @throws Error if any requested evaluator is missing, inactive, or not event-scoped
 */
export async function fetchAndValidateEvaluatorConfigs(params: {
  projectId: string;
  evaluatorIds: string[];
}): Promise<ObservationEvalConfig[]> {
  const { projectId, evaluatorIds } = params;

  const evaluators = await prisma.jobConfiguration.findMany({
    where: {
      id: { in: evaluatorIds },
      projectId,
      targetObject: EvalTargetObject.EVENT,
      status: "ACTIVE",
    },
    select: {
      id: true,
      projectId: true,
      filter: true,
      sampling: true,
      evalTemplateId: true,
      scoreName: true,
      targetObject: true,
      variableMapping: true,
    },
  });

  if (evaluators.length !== evaluatorIds.length) {
    const foundIds = new Set(evaluators.map((e) => e.id));
    const missingIds = evaluatorIds.filter((id) => !foundIds.has(id));

    throw new Error(
      missingIds.length > 0
        ? `Evaluators [${missingIds.join(", ")}] are missing, inactive, or not event-scoped for historical event evaluation.`
        : "Selected evaluators are missing, inactive, or not event-scoped for historical event evaluation.",
    );
  }

  // Return evaluators in the same order as the input evaluatorIds
  const evaluatorById = new Map(evaluators.map((e) => [e.id, e]));
  return evaluatorIds.map(
    (id) => evaluatorById.get(id) as ObservationEvalConfig,
  );
}
