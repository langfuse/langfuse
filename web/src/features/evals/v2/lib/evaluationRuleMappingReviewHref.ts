export function getEvaluationRuleMappingReviewHref({
  projectId,
  ruleId,
  evaluatorId,
}: {
  projectId: string;
  ruleId: string;
  evaluatorId: string;
}) {
  return `/project/${encodeURIComponent(projectId)}/evals/v2/rules?peek=${encodeURIComponent(ruleId)}&mappingEvaluatorId=${encodeURIComponent(evaluatorId)}`;
}
