/**
 * Dataset whose items the compare-view Item ID / Input cells can open.
 *
 * A managed Langfuse dataset is required; local-data runs have no item page.
 * When a baseline is selected, only that run's dataset is used — a comparison
 * from another dataset must not become the destination for the baseline's
 * local item ids.
 */
export function resolveSourceDatasetId(
  experiments: Array<{ experimentId: string; datasetId: string | null }>,
  baselineId?: string,
): string | null {
  if (baselineId) {
    return (
      experiments.find((experiment) => experiment.experimentId === baselineId)
        ?.datasetId ?? null
    );
  }

  const datasetIds = [
    ...new Set(
      experiments
        .map((experiment) => experiment.datasetId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  return datasetIds.length === 1 ? datasetIds[0] : null;
}

export function getDatasetItemPath({
  projectId,
  datasetId,
  itemId,
}: {
  projectId: string;
  datasetId: string;
  itemId: string;
}): string {
  return `/project/${projectId}/datasets/${datasetId}/items/${encodeURIComponent(itemId)}`;
}
