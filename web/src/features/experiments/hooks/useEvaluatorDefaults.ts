import { Decimal } from "decimal.js";
import { type EvalTemplate, EvalTargetObject } from "@langfuse/shared";
import { createDefaultVariableMappings } from "../utils/evaluatorMappingUtils";
import { type PartialConfig } from "@/src/features/evals/types";

export const CONFIG_BASE = {
  targetObject: EvalTargetObject.DATASET,
  sampling: new Decimal(1),
  delay: 30000,
  timeScope: ["NEW"],
};

export function useEvaluatorDefaults() {
  /**
   * Creates a default evaluator configuration with mappings and filters
   * @param template - The evaluation template to use
   * @param datasetId - The dataset ID to filter by
   * @param scoreName - Optional custom score name (defaults to template name)
   * @returns The configured evaluator with defaults
   */
  const createDefaultEvaluator = (
    template: EvalTemplate,
    datasetId: string,
    scoreName?: string,
  ): PartialConfig & { evalTemplate: EvalTemplate } => {
    // Create variable mappings (dataset evaluator schema)
    const variableMappings = createDefaultVariableMappings(template);

    // Return the configured evaluator for dataset target
    return {
      ...CONFIG_BASE,
      evalTemplate: template,
      scoreName: scoreName || template.name,
      variableMapping: variableMappings,
      filter: [
        {
          type: "stringOptions",
          value: [datasetId],
          column: "Dataset",
          operator: "any of",
        },
      ],
    };
  };

  return {
    createDefaultEvaluator,
  };
}
