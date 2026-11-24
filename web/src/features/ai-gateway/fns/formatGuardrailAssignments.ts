const MAX_PREVIEW_NAMES = 2;

export type GuardrailAssignmentSummary = {
  primary: string;
  secondary?: string;
  muted?: boolean;
};

/** Formats a guardrail's assignments for the Applies to column. */
export function formatGuardrailAssignments(
  assignments: readonly {
    scope: "ORGANIZATION" | "API_KEY" | "USER";
    label: string;
  }[],
): GuardrailAssignmentSummary {
  if (assignments.length === 0) {
    return { primary: "Not running", muted: true };
  }
  if (assignments.some((assignment) => assignment.scope === "ORGANIZATION")) {
    return { primary: "Everyone" };
  }
  if (assignments.length === 1) {
    return { primary: assignments[0]!.label };
  }
  const preview = assignments
    .slice(0, MAX_PREVIEW_NAMES)
    .map((assignment) => assignment.label);
  const remaining = assignments.length - preview.length;
  return {
    primary: `${assignments.length} targets`,
    secondary:
      remaining > 0
        ? `${preview.join(", ")} +${remaining} more`
        : preview.join(", "),
  };
}
