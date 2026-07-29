import { z } from "zod";
import {
  EvalTargetObjectSchema,
  singleFilter,
  type langfuseObjects,
  TimeScopeSchema,
} from "@langfuse/shared";
import { wipVariableMapping } from "@langfuse/shared";
import { OUTPUT_MAPPING } from "@/src/features/evals/utils/evaluator-constants";

// Legacy eval targets (TRACE, DATASET) use full variable mapping UI with object selector
// Modern eval targets (EVENT, EXPERIMENT) use simplified UI with just column selection
export const isLegacyEvalTarget = (target: string): boolean =>
  target === "trace" || target === "dataset";

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
    mapping.forEach(({ jsonSelector }, index) => {
      const compatibilityError = getJsonPathCompatibilityWarning(jsonSelector);

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

const stripJsonPathStringLiterals = (selector: string): string => {
  let quote: "'" | '"' | "`" | null = null;
  let isEscaped = false;

  // Ignore expression-like text inside quoted property names to avoid false warnings.
  return [...selector]
    .map((character) => {
      if (quote) {
        if (isEscaped) {
          isEscaped = false;
        } else if (character === "\\") {
          isEscaped = true;
        } else if (character === quote) {
          quote = null;
        }

        return " ";
      }

      if (character === "'" || character === '"' || character === "`") {
        quote = character;
        return " ";
      }

      return character;
    })
    .join("");
};

export function getJsonPathCompatibilityWarning(
  selector: string | null | undefined,
): string | null {
  if (!selector) return null;

  const selectorWithoutStrings = stripJsonPathStringLiterals(selector);

  if (/\[\s*\?/u.test(selectorWithoutStrings)) {
    return "Filter expressions ([?...]) are not supported and will not be applied.";
  }

  if (/\[\s*\(/u.test(selectorWithoutStrings)) {
    return "Script expressions ([(...)]) are not supported. The evaluator will use the unfiltered value instead.";
  }

  if (/\[\s*-\d+\s*\]/u.test(selectorWithoutStrings)) {
    return "Negative array indices (for example, [-1]) are not supported. Use a slice such as [-1:] instead.";
  }

  return null;
}

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
