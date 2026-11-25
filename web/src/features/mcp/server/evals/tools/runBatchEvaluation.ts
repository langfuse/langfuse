import { z } from "zod";
import { CreateObservationBatchEvaluationActionSchema } from "@/src/features/batch-actions/validation";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  buildStartTimeFilters,
  ObservationMcpBatchQueryFilterSchema,
  ObservationMcpFilterBaseSchema,
  OptionalStartTimeRangeShape,
} from "../../observations/filter-schema";
import { createMcpBatchEvaluationService } from "../batch-evaluation-service";

const { evaluatorIds, sampling, rowLimit } =
  CreateObservationBatchEvaluationActionSchema.shape;

const FILTER_DESCRIPTION =
  "Observation filters in the listObservations filter format; call getObservationFilterSchema for accepted columns and operators. The full-text `matches` operator is not supported here. Bound the selection by time with fromStartTime and toStartTime.";

const RunBatchEvaluationBaseSchema = z
  .object({
    evaluatorIds: evaluatorIds.describe(
      "IDs of the evaluators to run, as returned by listEvaluators. Each must be observation-scoped and not attached to a trace- or dataset-level evaluation rule.",
    ),
    ...OptionalStartTimeRangeShape,
    filter: z
      .array(ObservationMcpFilterBaseSchema)
      .optional()
      .describe(FILTER_DESCRIPTION),
    sampling: sampling.describe(
      "Fraction of matching observations to evaluate, between 0 and 1. Defaults to 1.",
    ),
    rowLimit: rowLimit.describe(
      "Maximum number of observations to evaluate. Without it, the run is rejected when more observations match than the instance's batch evaluation limit.",
    ),
  })
  .strict();

const RunBatchEvaluationInputSchema = RunBatchEvaluationBaseSchema.extend({
  filter: z
    .array(ObservationMcpBatchQueryFilterSchema)
    .optional()
    .describe(FILTER_DESCRIPTION),
}).transform(({ fromStartTime, toStartTime, filter, ...input }) => ({
  ...input,
  filter: [
    ...(filter ?? []),
    ...buildStartTimeFilters({ fromStartTime, toStartTime }),
  ],
}));

export const [runBatchEvaluationTool, handleRunBatchEvaluation] = defineTool({
  name: "runBatchEvaluation",
  description: [
    "Run one or more saved evaluators over the existing observations that match a filter in the current Langfuse project, like Run Evaluation in the observations table.",
    "Preview the selection with listObservations using the same filter and time range before running. Observations older than the plan's data-access window are never evaluated.",
    "The run is queued and processed asynchronously; this returns the batch action id. Results are written as scores on the evaluated observations, and each score and evaluator trace carries the batch action id as batch_action_id metadata.",
    "This executes every selected evaluator on every selected observation and may incur model or code execution cost.",
  ].join(" "),
  action: "evaluationRule:CUD",
  baseSchema: RunBatchEvaluationBaseSchema,
  inputSchema: RunBatchEvaluationInputSchema,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluators.run_batch",
      context,
      attributes: {
        "mcp.evaluator_count": input.evaluatorIds.length,
      },
      fn: () =>
        createMcpBatchEvaluationService(context).create(
          {
            projectId: context.projectId,
            query: { filter: input.filter, orderBy: null },
            evaluatorIds: input.evaluatorIds,
            sourceTable: "events",
            evalVersion: "v2",
            sampling: input.sampling,
            rowLimit: input.rowLimit,
          },
          { userId: context.userId ?? context.apiKeyId, plan: context.plan },
        ),
    }),
  expensiveHint: true,
});
