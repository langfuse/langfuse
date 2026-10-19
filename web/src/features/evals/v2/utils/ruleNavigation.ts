import { isLegacyEvalTarget } from "@/src/features/evals/utils/typeHelpers";

export function getRuleNavigationAction({
  targetObject,
  enabled,
}: {
  targetObject: string;
  enabled: boolean;
}) {
  if (!isLegacyEvalTarget(targetObject)) return "edit";
  return enabled ? "remap" : "peek";
}

export function getRuleNavigationUrl({
  projectId,
  ruleId,
  targetObject,
  enabled,
}: {
  projectId: string;
  ruleId: string;
  targetObject: string;
  enabled: boolean;
}) {
  const projectPath = `/project/${encodeURIComponent(projectId)}/evals`;
  const encodedRuleId = encodeURIComponent(ruleId);
  const action = getRuleNavigationAction({ targetObject, enabled });

  if (action === "remap") {
    return `${projectPath}/remap?evaluator=${encodedRuleId}`;
  }
  if (action === "peek") {
    return `${projectPath}/rules?peek=${encodedRuleId}`;
  }
  return `${projectPath}/rules?rule=${encodedRuleId}`;
}
