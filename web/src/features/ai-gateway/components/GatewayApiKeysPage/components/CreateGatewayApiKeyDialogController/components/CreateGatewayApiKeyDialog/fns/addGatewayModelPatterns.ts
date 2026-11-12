/** Adds the comma-separated patterns typed in the models input, skipping blanks and duplicates. */
export const addGatewayModelPatterns = (
  patterns: readonly string[],
  draft: string,
) => [
  ...new Set([
    ...patterns,
    ...draft
      .split(",")
      .map((pattern) => pattern.trim())
      .filter(Boolean),
  ]),
];
