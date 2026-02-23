import { Decimal } from "decimal.js";
import {
  type EvalTemplate,
  EvalTargetObject,
  JobConfigState,
} from "@langfuse/shared";
import { type PartialConfig } from "@/src/features/evals/types";
import { createDefaultVariableMappings } from "@/src/features/experiments/utils/evaluatorMappingUtils";

export const CONFIG_BASE = {
  sampling: new Decimal(1),
  delay: 30000,
  timeScope: ["NEW"],
  status: JobConfigState.ACTIVE,
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
      targetObject: EvalTargetObject.EXPERIMENT,
      evalTemplate: template,
      scoreName: scoreName || template.name,
      variableMapping: variableMappings,
      filter: [
        {
          type: "stringOptions",
          value: [datasetId],
          // Use the column id (not display name) for EXPERIMENT target
          // This maps to observation.experimentDatasetId in the filter service
          column: "experimentDatasetId",
          operator: "any of",
        },
      ],
    };
  };

  return {
    createDefaultEvaluator,
  };
}
