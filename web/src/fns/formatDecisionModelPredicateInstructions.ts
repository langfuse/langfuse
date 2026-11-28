/**
 * Formats a yes/no predicate question and optional true/false criteria into the
 * single `instructions` string expected by OpenAI-compatible `/v1/decisions`.
 */
export function formatDecisionModelPredicateInstructions(
  instructions: string,
  criteria?: { true?: string | null; false?: string | null } | null,
): string {
  const parts = [instructions.trim()];
  const whenTrue = criteria?.true?.trim();
  const whenFalse = criteria?.false?.trim();
  if (whenTrue) parts.push(`Criteria for true:\n${whenTrue}`);
  if (whenFalse) parts.push(`Criteria for false:\n${whenFalse}`);
  return parts.filter((part) => part.length > 0).join("\n\n");
}
