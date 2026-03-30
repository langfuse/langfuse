/**
 * URL translation utilities for switching between old dataset-run views
 * and new experiments views.
 *
 * Old (non-beta) URLs:
 * - /datasets/[datasetId]/compare?runs=A&runs=B&runs=C
 * - /datasets/[datasetId]/runs/[runId]
 *
 * New (beta) URLs:
 * - /experiments/results?baseline=A&c=B,C
 */

/**
 * Translate old compare/runs URLs to new experiments URL format.
 * First runId becomes baseline, rest become comma-separated comparisons.
 */
export function toExperimentsResultsUrl(
  projectId: string,
  runIds: string[],
): string {
  if (runIds.length === 0) {
    return `/project/${projectId}/experiments`;
  }

  const [baseline, ...comparisons] = runIds;
  const params = new URLSearchParams();
  params.set("baseline", baseline);

  if (comparisons.length > 0) {
    params.set("c", comparisons.join(","));
  }

  return `/project/${projectId}/experiments/results?${params.toString()}`;
}

/**
 * Translate new experiments URL params to old compare URL format.
 * Baseline + comparisons become runs array.
 */
export function toDatasetCompareUrl(
  projectId: string,
  datasetId: string,
  baseline: string,
  comparisons: string[] = [],
): string {
  const allRunIds = [baseline, ...comparisons];
  const params = new URLSearchParams();

  allRunIds.forEach((runId) => {
    params.append("runs", runId);
  });

  return `/project/${projectId}/datasets/${datasetId}/compare?${params.toString()}`;
}

/**
 * Translate single run view to experiments results URL.
 */
export function singleRunToExperimentsUrl(
  projectId: string,
  runId: string,
): string {
  return `/project/${projectId}/experiments/results?baseline=${encodeURIComponent(runId)}`;
}

/**
 * Parse experiments results URL params.
 */
export function parseExperimentsResultsParams(query: {
  baseline?: string;
  c?: string;
}): { baseline: string | null; comparisons: string[] } {
  const baseline = query.baseline ?? null;
  const comparisons = query.c ? query.c.split(",").filter(Boolean) : [];

  return { baseline, comparisons };
}
