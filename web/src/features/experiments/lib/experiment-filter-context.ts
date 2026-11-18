export function buildExperimentFilterContextId({
  projectId,
  baselineId,
  comparisonIds,
}: {
  projectId: string | undefined;
  baselineId: string | undefined;
  comparisonIds: readonly string[];
}): string {
  return JSON.stringify([
    projectId ?? null,
    baselineId ?? null,
    comparisonIds.slice().sort(),
  ]);
}
