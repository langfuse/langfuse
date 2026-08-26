import {
  EvalTargetObject,
  EvalTemplateType,
  InvalidRequestError,
  LangfuseNotFoundError,
  validateEvaluatorFiltersForTarget,
  type FilterState,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  getLatestEvaluatorRunCost,
  getObservationsCountFromEventsTable,
  getObservationsWithModelDataFromEventsTable,
  logger,
} from "@langfuse/shared/src/server";
import { findEvaluatorsByIds } from "./evaluatorRepository";
import { toEvaluatorDefinition } from "./evaluatorService";
import { testEvaluator } from "./testEvaluator";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;
const TEST_COST_RETRY_DELAYS_MS = [
  0, 250, 500, 1_000, 2_000, 4_000, 8_000,
] as const;

export async function getActivationCostEstimates(params: {
  orgId: string;
  projectId: string;
  evaluatorIds: string[];
  filter: FilterState;
  sampling: number;
  knownTestRunCostUsd?: number;
  shouldRunMissingTest?: boolean;
  shouldReadFromObservationsTable: boolean;
}) {
  const validation = validateEvaluatorFiltersForTarget({
    targetObject: EvalTargetObject.EVENT,
    filter: params.filter,
  });
  if (!validation.isValid) {
    throw new InvalidRequestError(
      validation.issues[0]?.message ?? "Evaluation rule filters are invalid.",
    );
  }

  const evaluators = await findEvaluatorsByIds({
    prisma,
    projectId: params.projectId,
    evaluatorIds: params.evaluatorIds,
  });
  if (evaluators.length !== new Set(params.evaluatorIds).size) {
    throw new LangfuseNotFoundError("Evaluator not found");
  }
  const llmEvaluators = evaluators.filter(
    (evaluator) => evaluator.type === EvalTemplateType.LLM_AS_JUDGE,
  );

  const since = new Date(Date.now() - SEVEN_DAYS_MS);
  const filter: FilterState = [
    ...validation.validatedFilters,
    {
      column: "startTime",
      type: "datetime",
      operator: ">=",
      value: since,
    },
  ];
  const [matchingObservations, recentRunCosts] = await Promise.all([
    getObservationsCountFromEventsTable({
      projectId: params.projectId,
      filter,
      // Required by the shared query shape; the count aggregate ignores paging.
      limit: 1,
      offset: 0,
    }),
    Promise.all(
      llmEvaluators.map(async (evaluator) =>
        getLatestEvaluatorRunCost(params.projectId, evaluator.id),
      ),
    ),
  ]);
  const costsByEvaluatorId = new Map<string, number | null>(
    evaluators.map((evaluator) => [
      evaluator.id,
      evaluator.type === EvalTemplateType.LLM_AS_JUDGE ? null : 0,
    ]),
  );
  llmEvaluators.forEach((evaluator, index) =>
    costsByEvaluatorId.set(evaluator.id, recentRunCosts[index] ?? null),
  );
  const knownCostEvaluatorId = params.evaluatorIds[0];
  if (
    knownCostEvaluatorId &&
    costsByEvaluatorId.get(knownCostEvaluatorId) === null &&
    params.knownTestRunCostUsd !== undefined
  ) {
    costsByEvaluatorId.set(knownCostEvaluatorId, params.knownTestRunCostUsd);
  }

  const evaluatorsWithoutCost = llmEvaluators.filter(
    (evaluator) => costsByEvaluatorId.get(evaluator.id) === null,
  );
  if (
    params.shouldRunMissingTest === false &&
    matchingObservations > 0 &&
    evaluatorsWithoutCost.length > 0
  ) {
    const availableCosts = await Promise.all(
      evaluatorsWithoutCost.map(async (evaluator) => ({
        evaluatorId: evaluator.id,
        cost: await waitForEvaluatorRunCost(params.projectId, evaluator.id),
      })),
    );
    availableCosts.forEach(({ evaluatorId, cost }) =>
      costsByEvaluatorId.set(evaluatorId, cost),
    );
  } else if (matchingObservations > 0 && evaluatorsWithoutCost.length > 0) {
    const sample = (
      await getObservationsWithModelDataFromEventsTable({
        projectId: params.projectId,
        filter,
        orderBy: { column: "startTime", order: "DESC" },
        limit: 1,
        offset: 0,
        selectIOAndMetadata: false,
      })
    )[0];

    if (sample?.traceId) {
      const generatedCosts = await Promise.all(
        evaluatorsWithoutCost.map(async (evaluator) => ({
          evaluatorId: evaluator.id,
          cost: await runTestAndWaitForCost({ params, evaluator, sample }),
        })),
      );
      generatedCosts.forEach(({ evaluatorId, cost }) =>
        costsByEvaluatorId.set(evaluatorId, cost),
      );
    }
  }

  return params.evaluatorIds.map((evaluatorId) => {
    const testRunCostUsd = costsByEvaluatorId.get(evaluatorId) ?? null;
    return {
      evaluatorId,
      matchingObservations,
      sampling: params.sampling,
      testRunCostUsd,
      estimatedCostUsd:
        testRunCostUsd === null
          ? null
          : matchingObservations * params.sampling * testRunCostUsd,
    };
  });
}

async function runTestAndWaitForCost({
  params,
  evaluator,
  sample,
}: {
  params: Parameters<typeof getActivationCostEstimates>[0];
  evaluator: Awaited<ReturnType<typeof findEvaluatorsByIds>>[number];
  sample: Awaited<
    ReturnType<typeof getObservationsWithModelDataFromEventsTable>
  >[number];
}) {
  const latestVersion = evaluator.versions[0];
  if (!sample.traceId || !latestVersion) return null;

  try {
    const result = await testEvaluator({
      orgId: params.orgId,
      projectId: params.projectId,
      evaluatorId: evaluator.id,
      definition: toEvaluatorDefinition(evaluator.type, latestVersion),
      observationId: sample.id,
      traceId: sample.traceId,
      startTime: sample.startTime,
      shouldReadFromObservationsTable: params.shouldReadFromObservationsTable,
    });
    if (!("executionTraceId" in result)) return null;
    if (
      "estimatedCostUsd" in result &&
      typeof result.estimatedCostUsd === "number"
    ) {
      return result.estimatedCostUsd;
    }

    return waitForEvaluatorRunCost(params.projectId, evaluator.id);
  } catch (error) {
    logger.warn("Automatic evaluator test for cost estimation failed", {
      projectId: params.projectId,
      evaluatorId: evaluator.id,
      error,
    });
  }

  return null;
}

async function waitForEvaluatorRunCost(projectId: string, evaluatorId: string) {
  for (const delayMs of TEST_COST_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const cost = await getLatestEvaluatorRunCost(projectId, evaluatorId);
    if (cost !== null) return cost;
  }
  return null;
}
