import { EvalTemplateTypeEnum, singleFilterList } from "@langfuse/shared";
import type { AgUiContext } from "@langfuse/shared/in-app-agent";
import { z } from "zod";

export const EVALUATOR_WORKBENCH_CONTEXT_DESCRIPTION = "evaluator_workbench";

const boundedString = z.string().trim().min(1).max(500);
const MAX_WORKBENCH_FILTER_JSON_LENGTH = 20_000;
const sampleFilterSchema = singleFilterList
  .refine(
    (filter) => filter.length <= 20,
    "Evaluator workbench filters are limited to 20 conditions",
  )
  .refine(
    (filter) =>
      JSON.stringify(filter).length <= MAX_WORKBENCH_FILTER_JSON_LENGTH,
    "Evaluator workbench filters are too large",
  );

const evaluatorWorkbenchContextSchema = z.object({
  projectId: boundedString,
  evaluatorId: boundedString,
  mode: z.enum(["create", "edit"]),
  evaluatorType: z.enum(EvalTemplateTypeEnum),
  sampleFilter: sampleFilterSchema,
  selectedObservation: z
    .object({
      observationId: boundedString,
      traceId: boundedString,
      startTime: z.iso.datetime({ offset: true }),
    })
    .optional(),
  draft: z
    .object({
      variables: z.array(boundedString).max(50),
      mappings: z
        .array(
          z.object({
            variable: boundedString,
            selectedColumnId: boundedString,
            jsonSelector: z.string().trim().max(500).optional(),
          }),
        )
        .max(50),
    })
    .optional(),
});

export function sanitizeEvaluatorWorkbenchContext(
  context: AgUiContext,
  projectId: string,
): AgUiContext[number] | null {
  const workbenchContext = context.find(
    (item) => item.description === EVALUATOR_WORKBENCH_CONTEXT_DESCRIPTION,
  );
  if (!workbenchContext) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(workbenchContext.value);
  } catch {
    return null;
  }

  const result = evaluatorWorkbenchContextSchema.safeParse(parsed);
  if (!result.success || result.data.projectId !== projectId) {
    return null;
  }

  const { projectId: _projectId, ...sanitized } = result.data;
  return {
    description: EVALUATOR_WORKBENCH_CONTEXT_DESCRIPTION,
    value: JSON.stringify(sanitized),
  };
}
