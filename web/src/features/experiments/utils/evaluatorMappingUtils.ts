import {
  type EvalTemplate,
  type ObservationVariableMapping,
} from "@langfuse/shared";

// Define the type locally to match what's in @langfuse/shared
type VariableMapping = {
  templateVariable: string;
  langfuseObject: "trace" | "generation" | "span" | "score" | "dataset_item";
  objectName?: string;
  selectedColumnId: string;
  jsonSelector?: string;
};

const defaultMappings = new Map<string, Partial<VariableMapping>>([
  // Common input variables
  ["input", { langfuseObject: "trace", selectedColumnId: "input" }],
  ["query", { langfuseObject: "trace", selectedColumnId: "input" }],
  ["question", { langfuseObject: "trace", selectedColumnId: "input" }],
  ["prompt", { langfuseObject: "trace", selectedColumnId: "input" }],

  // Common output variables
  ["output", { langfuseObject: "trace", selectedColumnId: "output" }],
  ["response", { langfuseObject: "trace", selectedColumnId: "output" }],
  ["answer", { langfuseObject: "trace", selectedColumnId: "output" }],
  ["completion", { langfuseObject: "trace", selectedColumnId: "output" }],

  // Common ground truth variables
  [
    "expected_output",
    { langfuseObject: "dataset_item", selectedColumnId: "expected_output" },
  ],
  [
    "ground_truth",
    { langfuseObject: "dataset_item", selectedColumnId: "expected_output" },
  ],
  [
    "reference",
    { langfuseObject: "dataset_item", selectedColumnId: "expected_output" },
  ],
]);

// Default mappings for observation-based evaluators (event/experiment)
const observationDefaultMappings = new Map<
  string,
  { selectedColumnId: string; jsonSelector?: string }
>([
  // Common input variables
  ["input", { selectedColumnId: "input" }],
  ["query", { selectedColumnId: "input" }],
  ["question", { selectedColumnId: "input" }],
  ["prompt", { selectedColumnId: "input" }],

  // Common output variables
  ["output", { selectedColumnId: "output" }],
  ["response", { selectedColumnId: "output" }],
  ["answer", { selectedColumnId: "output" }],
  ["completion", { selectedColumnId: "output" }],

  // Common ground truth variables (from experiment item)
  ["expected_output", { selectedColumnId: "experiment_item_expected_output" }],
  ["ground_truth", { selectedColumnId: "experiment_item_expected_output" }],
  ["reference", { selectedColumnId: "experiment_item_expected_output" }],
]);

/**
 * Creates default variable mappings for an evaluator template.
 *
 * @param template - The evaluation template containing variables
 * @returns Array of variable mappings
 */
export function createDefaultVariableMappings(
  template: EvalTemplate,
): VariableMapping[] {
  if (!template.vars || template.vars.length === 0) {
    return [];
  }

  return template.vars.map((variable) => {
    // Check if we have a default mapping for this variable name
    const defaultMapping = defaultMappings.get(variable.toLowerCase());

    if (defaultMapping) {
      return {
        templateVariable: variable,
        langfuseObject: defaultMapping.langfuseObject || "dataset_item",
        selectedColumnId: defaultMapping.selectedColumnId || "expected_output",
        objectName: defaultMapping.objectName,
        jsonSelector: defaultMapping.jsonSelector,
      };
    }

    return {
      langfuseObject: "dataset_item",
      templateVariable: variable,
      selectedColumnId: "expected_output",
      objectName: undefined,
      jsonSelector: undefined,
    };
  });
}

/**
 * Creates default variable mappings for observation-based evaluators (event/experiment).
 * Unlike trace/dataset evals, these don't need langfuseObject or objectName since
 * the observation is already selected - we only need to specify which column to use.
 *
 * @param template - The evaluation template containing variables
 * @returns Array of observation variable mappings (simplified, no langfuseObject/objectName)
 */
export function createDefaultObservationVariableMappings(
  template: EvalTemplate,
): ObservationVariableMapping[] {
  if (!template.vars || template.vars.length === 0) {
    return [];
  }

  return template.vars.map((variable) => {
    // Check if we have a default mapping for this variable name
    const defaultMapping = observationDefaultMappings.get(
      variable.toLowerCase(),
    );

    return {
      templateVariable: variable,
      selectedColumnId:
        defaultMapping?.selectedColumnId || "experiment_item_expected_output",
      jsonSelector: defaultMapping?.jsonSelector,
    };
  });
}
