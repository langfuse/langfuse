import { isoDateTime, singleFilter } from "@langfuse/shared";
import { z } from "zod";
import { CreateObservationBatchEvaluationActionSchema } from "@/src/features/batch-actions/validation";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  ObservationMcpFilterBaseSchema,
  ObservationMcpFilterSchema,
} from "../../observations/tools/listObservations";
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
    fromStartTime: isoDateTime({ offset: true })
      .optional()
      .describe(
        "Inclusive lower bound on observation startTime, as an ISO 8601 timestamp with timezone. Observations older than the plan's data-access window are never evaluated.",
      ),
    toStartTime: isoDateTime({ offset: true })
      .optional()
      .describe(
        "Exclusive upper bound on observation startTime, as an ISO 8601 timestamp with timezone.",
      ),
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

// Batch queries use the generic filter contract, which excludes the
// events-only full-text operator listObservations accepts.
const BatchQueryFilterSchema = ObservationMcpFilterSchema.transform(
  (filter, ctx) => {
    const parsed = singleFilter.safeParse(filter);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
    }
    return z.NEVER;
  },
);

const startTimeFilter = (operator: ">=" | "<", value: string) => ({
  type: "datetime" as const,
  column: "startTime",
  operator,
  value: new Date(value),
});

const RunBatchEvaluationInputSchema = RunBatchEvaluationBaseSchema.extend({
  filter: z
    .array(BatchQueryFilterSchema)
    .optional()
    .describe(FILTER_DESCRIPTION),
}).transform(({ fromStartTime, toStartTime, filter, ...input }) => ({
  ...input,
  filter: [
    ...(filter ?? []),
    ...(fromStartTime ? [startTimeFilter(">=", fromStartTime)] : []),
    ...(toStartTime ? [startTimeFilter("<", toStartTime)] : []),
  ],
}));

export const [runBatchEvaluationTool, handleRunBatchEvaluation] = defineTool({
  name: "runBatchEvaluation",
  description: [
    "Run one or more saved evaluators over the existing observations that match a filter in the current Langfuse project, like Run Evaluation in the observations table.",
    "Preview the selection with listObservations using the same filter and time range before running.",
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
            evalVersion: "v2",
            sampling: input.sampling,
            rowLimit: input.rowLimit,
          },
          { userId: context.userId ?? context.apiKeyId, plan: context.plan },
        ),
    }),
  expensiveHint: true,
});
