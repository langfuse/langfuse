import { z } from "zod";
import { singleFilterList } from "@langfuse/shared";

import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  ObservationMcpFilterBaseSchema,
  ObservationMcpFilterSchema,
} from "../../observations/tools/listObservations";
import { createMcpEvaluatorService } from "../evaluator-service";

const MAX_WORKBENCH_FILTER_JSON_LENGTH = 20_000;

const workbenchFilterSize = <T>(schema: z.ZodType<T>) =>
  schema.refine(
    (filter) =>
      JSON.stringify(filter).length <= MAX_WORKBENCH_FILTER_JSON_LENGTH,
    "Evaluator workbench filters are too large",
  );

const SetEvaluatorWorkbenchFilterBase = z.object({
  evaluatorId: z.string().min(1),
  filter: workbenchFilterSize(
    z.array(ObservationMcpFilterBaseSchema).max(20),
  ).describe(
    "Observation filter conditions for the open evaluator workbench. Call getObservationFilterSchema for supported columns and operators.",
  ),
});

const WorkbenchFilterInput = z
  .array(ObservationMcpFilterSchema)
  .max(20)
  .transform((filter, ctx) => {
    const parsed = singleFilterList.safeParse(filter);
    if (parsed.success) return parsed.data;

    const issue = parsed.error.issues[0];
    ctx.addIssue({
      code: "custom",
      path: issue?.path,
      message:
        issue?.message ?? "Filter is not compatible with the evaluator table",
    });
    return z.NEVER;
  });

const SetEvaluatorWorkbenchFilterInput = z.object({
  evaluatorId: z.string().min(1),
  filter: workbenchFilterSize(WorkbenchFilterInput),
});

export const [
  setEvaluatorWorkbenchFilterTool,
  handleSetEvaluatorWorkbenchFilter,
] = defineTool({
  name: "setEvaluatorWorkbenchFilter",
  description: [
    "Set the observation filters in the currently open evaluator workbench for a saved evaluator.",
    "This is an ephemeral UI-only change: it does not update the evaluator definition, sample filter persistence, or an evaluation rule.",
    "Use it before inspecting representative observations so the visible sample table matches the intended observation scope.",
    "The browser applies the validated filter after this tool completes. If that evaluator workbench is no longer open, the request safely has no UI effect.",
  ].join(" "),
  action: "evaluator:CUD",
  baseSchema: SetEvaluatorWorkbenchFilterBase,
  inputSchema: SetEvaluatorWorkbenchFilterInput,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluators.set_workbench_filter",
      context,
      attributes: {
        "mcp.evaluator_id": input.evaluatorId,
        "mcp.filter_count": input.filter.length,
      },
      fn: async () => {
        await createMcpEvaluatorService(context).get(
          context.projectId,
          input.evaluatorId,
        );

        return {
          evaluatorId: input.evaluatorId,
          filter: input.filter,
          application: "pending_current_ui",
          persisted: false,
        };
      },
    }),
});
