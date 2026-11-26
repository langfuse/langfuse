/**
 * Environments shown unless a user turns them off. Langfuse's own traffic
 * (evaluators, prompt experiments, the AI gateway, ...) runs in `langfuse-*`
 * environments and is hidden by default.
 */
export const isEnvironmentVisibleByDefault = (environment: string) =>
  !environment.startsWith("langfuse-");

export function convertSelectedEnvironmentsToFilter(
  environmentColumns: string[],
  selectedEnvironments: string[],
) {
  if (selectedEnvironments.length === 0) {
    // No environments selected = no filter (show all)
    return [];
  }

  return environmentColumns.map((column) => ({
    type: "stringOptions" as const,
    column,
    operator: "any of" as const,
    value: selectedEnvironments,
  }));
}
