/**
 * URL translation utilities for switching between old dataset-run views
 * and new experiments views.
 *
 * Old (non-beta) URLs:
 * - /datasets/[datasetId]/compare?runs=A&runs=B&runs=C
 * - /datasets/[datasetId]/runs/[runId]
 *
 * New (beta) URLs:
 * - /experiments/results?baseline=A&c=B&c=C
 */

/**
 * Translate old compare/runs URLs to new experiments URL format.
 * First runId becomes baseline, rest become repeated c params.
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

  comparisons.forEach((id) => {
    params.append("c", id);
  });

  return `/project/${projectId}/experiments/results?${params.toString()}`;
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
