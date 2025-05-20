import { type EvalTemplate } from "@langfuse/shared";

// Define the type locally to match what's in @langfuse/shared
type VariableMapping = {
  templateVariable: string;
  langfuseObject: "trace" | "generation" | "span" | "score" | "dataset_item";
  objectName?: string;
  selectedColumnId?: string;
  jsonSelector?: string;
};

/**
 * Creates default variable mappings for an evaluator template.
 * Uses an alternating pattern:
 * - Odd indexed variables map to dataset_item -> input
 * - Even indexed variables map to trace -> output
 *
 * @param template - The evaluation template containing variables
 * @param datasetId - The dataset ID to use for creating filter
 * @returns Array of variable mappings
 */
export function createDefaultVariableMappings(
  template: EvalTemplate,
  datasetId: string,
): VariableMapping[] {
  if (!template.vars || template.vars.length === 0) {
    return [];
  }

  return template.vars.map((variable, index) => {
    // Use modulo operation to alternate between patterns:
    // Odd indexes (1, 3, 5...) -> dataset_item -> input
    // Even indexes (0, 2, 4...) -> trace -> output
    const isEvenIndex = index % 2 === 0;

    return {
      templateVariable: variable,
      langfuseObject: isEvenIndex ? "trace" : "dataset_item",
      selectedColumnId: isEvenIndex ? "output" : "input",
    };
  });
}
