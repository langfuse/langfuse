import { z } from "zod";
import {
  EvalTargetObjectSchema,
  singleFilter,
  type langfuseObjects,
  TimeScopeSchema,
  wipVariableMapping,
} from "@langfuse/shared";
import { OUTPUT_MAPPING } from "@/src/features/evals/utils/evaluator-constants";
import { getJsonPathCompatibilityWarning } from "@/src/features/evals/utils/json-path-compatibility";

export { getJsonPathCompatibilityWarning } from "@/src/features/evals/utils/json-path-compatibility";

export const evalConfigFormSchema = z
  .object({
    scoreName: z.string(),
    target: EvalTargetObjectSchema,
    filter: z.array(singleFilter).nullable(), // reusing the filter type from the tables
    mapping: z.array(wipVariableMapping),
    sampling: z.coerce.number().gt(0).lte(1),
    delay: z.coerce.number().min(0).optional().default(10),
    timeScope: TimeScopeSchema,
    runOnLive: z.boolean().optional().default(true),
  })
  .superRefine(({ mapping }, ctx) => {
    mapping.forEach((mappingRow, index) => {
      const compatibilityError =
        getActiveJsonPathCompatibilityWarning(mappingRow);

      if (compatibilityError) {
        ctx.addIssue({
          code: "custom",
          path: ["mapping", index, "jsonSelector"],
          message: compatibilityError,
        });
      }
    });
  });

export type EvalFormType = z.infer<typeof evalConfigFormSchema>;

export type LangfuseObject = (typeof langfuseObjects)[number];

export type VariableMapping = z.infer<typeof wipVariableMapping>;

export const inferDefaultMapping = (
  variable: string,
): Pick<VariableMapping, "selectedColumnId"> => {
  return {
    selectedColumnId: OUTPUT_MAPPING.includes(variable.toLowerCase())
      ? "output"
      : "input",
  };
};

export const fieldHasJsonSelectorOption = (
  selectedColumnId: string | undefined | null,
): boolean =>
  selectedColumnId === "input" ||
  selectedColumnId === "output" ||
  selectedColumnId === "metadata" ||
  selectedColumnId === "expected_output" ||
  selectedColumnId === "experiment_item_expected_output" ||
  selectedColumnId === "experiment_item_metadata" ||
  selectedColumnId === "expectedOutput" ||
  selectedColumnId === "experimentItemExpectedOutput" ||
  selectedColumnId === "experimentItemMetadata" ||
  selectedColumnId === "toolCalls";

/**
 * Only warns while the row's JsonPath input is rendered: a target switch nulls
 * selectedColumnId but keeps jsonSelector
 * (`useEvaluatorTarget.transformMapping`), orphaning the value behind a hidden
 * input. Reporting it then would disable submit with no visible cause.
 */
export function getActiveJsonPathCompatibilityWarning(mappingRow: {
  selectedColumnId?: string | null;
  jsonSelector?: string | null;
}): string | null {
  if (!fieldHasJsonSelectorOption(mappingRow.selectedColumnId)) return null;

  return getJsonPathCompatibilityWarning(mappingRow.jsonSelector);
}

// Bookmarking is retired from the UI. Keep these ids/names in the shared
// column list so existing bookmarked filter rows still resolve a definition,
// but pass them to InlineFilterBuilder as hiddenUnlessSelected so only those
// grandfathered rows can keep the column — new rows cannot pick it.
export const RETIRED_TRACE_FILTER_COLUMNS = ["bookmarked", "⭐️"] as const;

export const getTargetDisplayName = (target: string): string => {
  switch (target) {
    case "trace":
      return "traces";
    case "event":
      return "observations";
    case "dataset":
      return "dataset run items";
    case "experiment":
      return "experiments";
    default:
      return target;
  }
};
