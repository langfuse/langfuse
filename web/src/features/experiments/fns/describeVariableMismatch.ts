/**
 * Message for the Dataset step's "Invalid configuration" banner when no dataset
 * item provides any of the prompt's variables.
 *
 * Names the variables so the reader can compare them against their dataset
 * without opening the "Expected columns" popover.
 */
export function describeVariableMismatch(variables: string[]): string {
  // Placeholder names are not deduped upstream, and a placeholder may repeat a
  // mustache variable.
  const named = [...new Set(variables)].join(", ");

  return named
    ? `No dataset item contains any of the variables this prompt expects: ${named}. Add them as top-level input keys, or choose a dataset that has them.`
    : "No dataset item contains any of the variables this prompt expects.";
}
