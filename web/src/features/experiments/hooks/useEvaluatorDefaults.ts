import { Decimal } from "decimal.js";
import { type EvalTemplate, EvalTargetObject } from "@langfuse/shared";
import { createDefaultObservationVariableMappings } from "../utils/evaluatorMappingUtils";
import { type PartialConfig } from "@/src/features/evals/types";

export const CONFIG_BASE = {
  targetObject: EvalTargetObject.EXPERIMENT,
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
    // Create variable mappings for experiment target (observation-based)
    const variableMappings = createDefaultObservationVariableMappings(template);

    // Return the configured evaluator for experiment target
    return {
      ...CONFIG_BASE,
      evalTemplate: template,
      scoreName: scoreName || template.name,
      variableMapping: variableMappings,
      filter: [
        {
          type: "stringOptions",
          value: [datasetId],
          // Use the column id (not display name) for EXPERIMENT target
          // This maps to observation.experiment_dataset_id in the filter service
          column: "experiment_dataset_id",
          operator: "any of",
        },
      ],
    };
  };

  return {
    createDefaultEvaluator,
  };
}
