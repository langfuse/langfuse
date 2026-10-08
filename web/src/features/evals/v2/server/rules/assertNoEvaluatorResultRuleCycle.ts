import { LangfuseConflictError } from "@langfuse/shared";

export function assertNoEvaluatorResultRuleCycle(
  edges: Array<{
    sourceEvaluatorId: string;
    targetEvaluatorIds: string[];
  }>,
) {
  const targetsBySource = new Map<string, Set<string>>();
  for (const edge of edges) {
    const targets = targetsBySource.get(edge.sourceEvaluatorId) ?? new Set();
    edge.targetEvaluatorIds.forEach((target) => targets.add(target));
    targetsBySource.set(edge.sourceEvaluatorId, targets);
  }

  const visited = new Set<string>();
  const activePath = new Set<string>();

  const visit = (evaluatorId: string): boolean => {
    if (activePath.has(evaluatorId)) return true;
    if (visited.has(evaluatorId)) return false;

    visited.add(evaluatorId);
    activePath.add(evaluatorId);
    for (const target of targetsBySource.get(evaluatorId) ?? []) {
      if (visit(target)) return true;
    }
    activePath.delete(evaluatorId);
    return false;
  };

  if ([...targetsBySource.keys()].some(visit)) {
    throw new LangfuseConflictError(
      "Evaluator result rules cannot create an evaluator cycle",
    );
  }
}
