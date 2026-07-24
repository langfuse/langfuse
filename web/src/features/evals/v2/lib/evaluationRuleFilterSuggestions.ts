type EvaluationRuleFilterSuggestionSource = {
  id: string;
  name: string;
  evaluators: { scoreName: string }[];
  evaluatorCount: number;
};

export type EvaluationRuleFilterSuggestionSection = {
  title: string;
  items: { id: string; label: string; detail: string }[];
};

function evaluatorNamesDetail(
  rule: EvaluationRuleFilterSuggestionSource,
): string {
  if (rule.evaluatorCount === 0) return "no evaluators yet";

  const names = rule.evaluators.map((evaluator) => evaluator.scoreName);
  const shown = names.slice(0, 2).join(", ");
  const rest = rule.evaluatorCount - Math.min(2, names.length);
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

export function buildEvaluationRuleFilterSuggestionSection({
  rules,
  attachedRuleIds,
}: {
  rules: EvaluationRuleFilterSuggestionSource[];
  attachedRuleIds: string[];
}): EvaluationRuleFilterSuggestionSection | undefined {
  if (rules.length === 0) return undefined;

  const attachedRuleIdSet = new Set(attachedRuleIds);
  const orderedRules = [...rules].sort(
    (left, right) =>
      Number(attachedRuleIdSet.has(right.id)) -
      Number(attachedRuleIdSet.has(left.id)),
  );

  return {
    title: "Reuse existing evaluation rule",
    items: orderedRules.map((rule) => ({
      id: rule.id,
      label: rule.name,
      detail: attachedRuleIdSet.has(rule.id)
        ? "Attached to this evaluator"
        : evaluatorNamesDetail(rule),
    })),
  };
}
