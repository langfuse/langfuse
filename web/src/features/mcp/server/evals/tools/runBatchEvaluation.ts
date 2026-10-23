import { singleFilter } from "@langfuse/shared";
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
  "Observation filters in the listObservations filter format; call getObservationFilterSchema for accepted columns and operators. The full-text `matches` operator is not supported here. Omit to evaluate every observation, which usually exceeds the batch limit; include a startTime range.";

const RunBatchEvaluationBaseSchema = z
  .object({
    evaluatorIds: evaluatorIds.describe(
      "IDs of the evaluators to run, as returned by listEvaluators. Each must be observation-scoped and not attached to a trace- or dataset-level evaluation rule.",
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

const RunBatchEvaluationInputSchema = RunBatchEvaluationBaseSchema.extend({
  filter: z
    .array(BatchQueryFilterSchema)
    .optional()
    .describe(FILTER_DESCRIPTION),
});

export const [runBatchEvaluationTool, handleRunBatchEvaluation] = defineTool({
  name: "runBatchEvaluation",
  description: [
    "Run one or more saved evaluators over the existing observations that match a filter in the current Langfuse project, like Run Evaluation in the observations table.",
    "Preview the selection with listObservations using the same filter before running.",
    "The run is queued and processed asynchronously; this returns the batch action id. Results are written as scores on the evaluated observations.",
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
            query: { filter: input.filter ?? [], orderBy: null },
            evaluatorIds: input.evaluatorIds,
            evalVersion: "v2",
            sampling: input.sampling,
            rowLimit: input.rowLimit,
          },
          { userId: context.userId ?? context.apiKeyId },
        ),
    }),
  expensiveHint: true,
});
