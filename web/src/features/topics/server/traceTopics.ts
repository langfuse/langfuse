import {
  getLatestFacetSummaries,
  getTopicActivity,
} from "@langfuse/shared/topics/server";
import { currentTopicResults } from "./currentResults";

const DAY_MS = 86_400_000;
const ACTIVITY_DAYS = 7;
const EXAMPLE_COUNT = 3;

/** Current facet results per trace; summaries start at each trace's first observation. */
export async function tracesTopics(
  projectId: string,
  traces: { traceId: string; timestamp: Date }[],
) {
  const times = traces.map((trace) => trace.timestamp.getTime());
  const traceIds = [...new Set(traces.map((trace) => trace.traceId))];
  const { facets } = await currentTopicResults(
    projectId,
    {
      from: new Date(Math.min(...times) - DAY_MS),
      to: new Date(Math.max(...times) + DAY_MS),
    },
    traceIds,
  );
  return Object.fromEntries(
    traceIds.map((traceId) => [
      traceId,
      facets.flatMap((facet) => {
        const row = facet.rows.find((item) => item.traceId === traceId);
        if (!row) return [];
        const topic = facet.topics.find((item) => item.id === row.topicId);
        return [
          {
            facetId: facet.facetId,
            name: facet.name,
            outcome: row.outcome,
            summary: row.summary,
            topic: topic
              ? {
                  id: topic.id,
                  name: topic.name,
                  description: topic.description,
                }
              : null,
          },
        ];
      }),
    ]),
  );
}

/** Last-7-day activity of a topic with a few other member traces. */
export async function topicContext(
  projectId: string,
  facetId: string,
  topicId: string,
  traceId: string,
) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCHours(0, 0, 0, 0);
  from.setTime(from.getTime() - (ACTIVITY_DAYS - 1) * DAY_MS);
  const timeRange = { from, to };
  const { daily, exampleTraceIds } = await getTopicActivity(
    projectId,
    facetId,
    topicId,
    timeRange,
    { excludeTraceId: traceId, exampleCount: EXAMPLE_COUNT },
  );
  const summaries = exampleTraceIds.length
    ? await getLatestFacetSummaries(
        projectId,
        facetId,
        undefined,
        timeRange,
        exampleTraceIds,
      )
    : [];
  const countByDay = new Map(daily.map((row) => [row.day, row.count]));
  return {
    days: Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
      const day = new Date(from.getTime() + index * DAY_MS)
        .toISOString()
        .slice(0, 10);
      return { day, count: countByDay.get(day) ?? 0 };
    }),
    totalCount: daily.reduce((sum, row) => sum + row.count, 0),
    examples: exampleTraceIds.map((id) => ({
      traceId: id,
      summary: summaries.find((row) => row.traceId === id)?.summary ?? "",
    })),
  };
}
