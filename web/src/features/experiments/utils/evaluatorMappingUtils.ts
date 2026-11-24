import {
  type EvalTemplate,
  type ObservationVariableMapping,
} from "@langfuse/shared";

const defaultColumnIds = new Map<string, string>([
  ["input", "input"],
  ["query", "input"],
  ["question", "input"],
  ["prompt", "input"],
  ["output", "output"],
  ["response", "output"],
  ["answer", "output"],
  ["completion", "output"],
  ["expected_output", "experimentItemExpectedOutput"],
  ["ground_truth", "experimentItemExpectedOutput"],
  ["reference", "experimentItemExpectedOutput"],
]);

/**
 * Creates default variable mappings of an experiment evaluator from the
 * template variable names. Variables without a known column stay unmapped
 * (`""`), so the form asks the user to pick one.
 */
export function createDefaultVariableMappings(
  template: EvalTemplate,
): ObservationVariableMapping[] {
  return (template.vars ?? []).map((variable) => ({
    templateVariable: variable,
    selectedColumnId: defaultColumnIds.get(variable.toLowerCase()) ?? "",
  }));
}
