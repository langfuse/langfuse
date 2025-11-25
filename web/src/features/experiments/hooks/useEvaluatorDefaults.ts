import { Decimal } from "decimal.js";
import { type EvalTemplate } from "@langfuse/shared";
import { createDefaultVariableMappings } from "../utils/evaluatorMappingUtils";
import { type PartialConfig } from "@/src/features/evals/types";

export const CONFIG_BASE = {
  targetObject: "dataset",
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
    // Create variable mappings that alternate between dataset_item and trace
    const alternatingMappings = createDefaultVariableMappings(template);

    // Return the configured evaluator
    return {
      ...CONFIG_BASE,
      evalTemplate: template,
      scoreName: scoreName || template.name,
      variableMapping: alternatingMappings,
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
