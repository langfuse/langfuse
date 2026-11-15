export type NewTopicRun = {
  ruleId: string;
  facetId: string;
  facetName: string;
  runId: string;
  newTopicCount: number;
};

/** Per rule and facet, the latest map run the viewer has seen. */
export type SeenTopicRuns = Record<string, string>;

const runKey = (run: Pick<NewTopicRun, "ruleId" | "facetId">) =>
  `${run.ruleId}:${run.facetId}`;

export function seenTopicRuns(runs: readonly NewTopicRun[]): SeenTopicRuns {
  return Object.fromEntries(runs.map((run) => [runKey(run), run.runId]));
}

/**
 * The sidebar count for unseen runs. Each facet takes the map that added the
 * most topics; one facet shows its topic count, several show how many facets
 * have new topics.
 */
export function newTopicsBadge(
  runs: readonly NewTopicRun[],
  seen: SeenTopicRuns,
): { count: number; description: string } | null {
  const byFacet = new Map<string, { name: string; count: number }>();
  for (const run of runs) {
    if (run.newTopicCount === 0 || seen[runKey(run)] === run.runId) continue;
    const current = byFacet.get(run.facetId);
    if (!current || run.newTopicCount > current.count)
      byFacet.set(run.facetId, {
        name: run.facetName,
        count: run.newTopicCount,
      });
  }
  const facets = [...byFacet.values()];
  if (facets.length === 0) return null;
  if (facets.length === 1) {
    const [{ name, count }] = facets;
    return {
      count,
      description: `${count} new ${count === 1 ? "topic" : "topics"} in ${name}`,
    };
  }
  return {
    count: facets.length,
    description: `New topics in ${facets.length} facets`,
  };
}

/** New topics per facet in the latest run of one rule's map. */
export function newTopicCountsForRule(
  runs: readonly NewTopicRun[],
  ruleId: string | undefined,
): Map<string, number> {
  return new Map(
    runs
      .filter((run) => run.ruleId === ruleId && run.newTopicCount > 0)
      .map((run) => [run.facetId, run.newTopicCount]),
  );
}
