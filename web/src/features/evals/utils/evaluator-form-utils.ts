import { z } from "zod/v4";
import {
  singleFilter,
  type langfuseObjects,
  TimeScopeSchema,
  EvalTargetObject,
  LangfuseInternalTraceEnvironment,
  ColumnDefinition,
} from "@langfuse/shared";
import { wipVariableMapping } from "@langfuse/shared";
import { ColumnDefinitionWithAlert } from "@/src/features/filters/components/filter-builder";
import {
  COLUMN_IDENTIFIERS_THAT_REQUIRE_PROPAGATION,
  OUTPUT_MAPPING,
} from "@/src/features/evals/utils/evaluator-constants";

export const isTraceTarget = (target: string): boolean =>
  target === EvalTargetObject.TRACE;
export const isTraceOrDatasetObject = (object: string): boolean =>
  object === EvalTargetObject.TRACE || object === "dataset_item";

export const evalConfigFormSchema = z.object({
  scoreName: z.string(),
  target: z.string(),
  filter: z.array(singleFilter).nullable(), // reusing the filter type from the tables
  mapping: z.array(wipVariableMapping),
  sampling: z.coerce.number().gt(0).lte(1),
  delay: z.coerce.number().min(0).optional().default(10),
  timeScope: TimeScopeSchema,
});

export type EvalFormType = z.infer<typeof evalConfigFormSchema>;

export type LangfuseObject = (typeof langfuseObjects)[number];

export type VariableMapping = z.infer<typeof wipVariableMapping>;

export const inferDefaultMapping = (
  variable: string,
): Pick<VariableMapping, "langfuseObject" | "selectedColumnId"> => {
  return {
    langfuseObject: "trace" as const,
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
  selectedColumnId === "expected_output";

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
