import type { FilterState } from "@langfuse/shared";

import { createProjectScopedRegistrationStore } from "@/src/features/in-app-agent/lib/projectScopedRegistrationStore";

const evaluatorWorkbenchFilters =
  createProjectScopedRegistrationStore<(filter: FilterState) => void>();

const getRegistrationKey = (evaluatorId: string) =>
  `evaluator-workbench-filter:${evaluatorId}`;

export function registerEvaluatorWorkbenchFilter(
  projectId: string,
  evaluatorId: string,
  apply: (filter: FilterState) => void,
) {
  return evaluatorWorkbenchFilters.register(
    projectId,
    getRegistrationKey(evaluatorId),
    apply,
  );
}

export function applyEvaluatorWorkbenchFilter(
  projectId: string,
  evaluatorId: string,
  filter: FilterState,
) {
  const apply = evaluatorWorkbenchFilters.get(
    projectId,
    getRegistrationKey(evaluatorId),
  );
  if (!apply) return false;

  apply(filter);
  return true;
}
