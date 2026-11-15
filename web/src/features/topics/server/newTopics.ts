import type { TopicDefinition } from "@langfuse/shared/topics";
import {
  getCurrentTopicMapRows,
  getTopicRuns,
  listTopicFacets,
} from "@langfuse/shared/topics/server";

/**
 * Whether a topic first appeared in this run: the run wrote its definition
 * and matched it against a previous map without continuing an earlier topic.
 * A topic a refit leaves unchanged keeps the definition, and so the metadata,
 * of the run that wrote it. A map fit without a previous map of the same
 * facet version carries no continuity, so none of its topics count as new.
 */
export function isNewTopicInRun(
  topic: Pick<TopicDefinition, "createdByRunId" | "metadata">,
  runId: string,
) {
  if (topic.createdByRunId !== runId) return false;
  const continuity = topic.metadata.continuity;
  return (
    typeof continuity === "object" &&
    continuity !== null &&
    "status" in continuity &&
    continuity.status !== "continued"
  );
}

/** Per rule and facet, how many topics the rule's current map added. */
export async function newTopicCounts(projectId: string) {
  const facets = await listTopicFacets(projectId);
  const maps = (
    await getCurrentTopicMapRows(
      projectId,
      facets.map((facet) => facet.id),
    )
  ).flatMap(({ ruleId, run }) => (ruleId ? [{ ruleId, runId: run.id }] : []));
  const runs = new Map(
    (
      await getTopicRuns(
        projectId,
        maps.map(({ runId }) => runId),
      )
    ).map((run) => [run.id, run]),
  );
  const facetNames = new Map(facets.map((facet) => [facet.id, facet.name]));
  return maps.flatMap(({ ruleId, runId }) => {
    const run = runs.get(runId);
    if (!run) return [];
    return [
      {
        ruleId,
        facetId: run.facetId,
        facetName: facetNames.get(run.facetId) ?? "",
        runId,
        newTopicCount: run.topics.filter((topic) =>
          isNewTopicInRun(topic, runId),
        ).length,
      },
    ];
  });
}
