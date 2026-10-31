import type {
  TopicAssignment,
  TopicFacet,
  TopicRun,
  TopicSummary,
  TopicTimeRange,
} from "@langfuse/shared/topics";
import { InvalidRequestError } from "@langfuse/shared";
import { OBSERVATIONS_TO_TRACE_INTERVAL_DAYS } from "@langfuse/shared/src/server";
import {
  getLatestFacetSummaries,
  getPublishedTopicRun,
  getTopicRuns,
  getTopicTraceUnitTimeRange,
  hasStoredTopicSummaries,
  listTopicFacets,
  listTopicRules,
  readLatestTopicAssignments,
} from "@langfuse/shared/topics/server";

/**
 * Which traces a result lists and when a stored assignment counts:
 * - "current": every summary; an assignment counts while it covers the latest summary.
 * - "rule": like "current", but only traces the rule assigned.
 * - "snapshot": the run's own assignment rows, even after a trace is summarized again.
 */
type TopicResultMembership = "current" | "rule" | "snapshot";

function resolveTopicResult(
  summary: Pick<
    TopicSummary,
    | "projectId"
    | "facetId"
    | "facetVersion"
    | "traceId"
    | "unitStartTime"
    | "processedAt"
    | "state"
  >,
  stored: TopicAssignment | undefined,
  membership: TopicResultMembership,
) {
  const sameSource =
    stored?.projectId === summary.projectId &&
    stored.facetId === summary.facetId &&
    stored.facetVersion === summary.facetVersion &&
    stored.traceId === summary.traceId &&
    stored.unitStartTime === summary.unitStartTime;
  const assignment =
    sameSource &&
    (membership === "snapshot" ||
      (summary.state === "complete" &&
        stored.summaryProcessedAt === summary.processedAt))
      ? stored
      : undefined;
  let outcome: string = summary.state;
  if (summary.state === "complete") outcome = "awaiting_map";
  if (assignment) outcome = assignment.topicId ? "assigned" : "outlier";
  return { assignment, outcome };
}

/**
 * Current state is resolved per trace and facet, independently of execution batches.
 * With a rule, facets, maps and rows narrow to that rule: only traces the rule
 * assigned appear. Without one, a trace's current topic comes from any rule.
 */
export async function currentTopicResults(
  projectId: string,
  timeRange: TopicTimeRange,
  {
    facetIds,
    traceIds,
    ruleId,
  }: { facetIds?: string[]; traceIds?: string[]; ruleId?: string } = {},
) {
  const facets = (await listTopicFacets(projectId)).filter(
    (facet) => !facetIds || facetIds.includes(facet.id),
  );
  const hasStoredSummaries =
    facets.length > 0 && (await hasStoredTopicSummaries(projectId));
  if (!hasStoredSummaries) return { hasStoredSummaries, facets: [] };
  // Only facets enabled on a rule get tabs; without rules, all show.
  const rules = await listTopicRules(projectId);
  const scoped = ruleId ? rules.filter((rule) => rule.id === ruleId) : rules;
  if (ruleId && !scoped.length)
    throw new InvalidRequestError("Topic rule not found in this project.");
  const enabledFacetIds = scoped.length
    ? new Set(scoped.flatMap((rule) => rule.facetIds))
    : null;
  const currentFacets = await Promise.all(
    facets
      .filter((facet) => !enabledFacetIds || enabledFacetIds.has(facet.id))
      .map(async (facet) => {
        const [storedAssignments, storedSummaries, run] = await Promise.all([
          readLatestTopicAssignments(
            projectId,
            facet.id,
            timeRange,
            traceIds,
            ruleId,
          ),
          getLatestFacetSummaries(
            projectId,
            facet.id,
            undefined,
            timeRange,
            traceIds,
          ),
          getPublishedTopicRun(projectId, facet.id, ruleId),
        ]);
        return facetTopicResult({
          projectId,
          facet,
          storedAssignments,
          storedSummaries,
          run,
          membership: ruleId ? "rule" : "current",
        });
      }),
  );
  return { hasStoredSummaries, facets: currentFacets };
}

/** One facet's rows, topic counts and map from stored summaries and assignments. */
export async function facetTopicResult({
  projectId,
  facet,
  storedAssignments,
  storedSummaries,
  run,
  membership,
}: {
  projectId: string;
  facet: TopicFacet;
  storedAssignments: TopicAssignment[];
  storedSummaries: Awaited<ReturnType<typeof getLatestFacetSummaries>>;
  run: TopicRun | null;
  membership: TopicResultMembership;
}) {
  const version = facet.versions[0];
  const assignmentByTrace = new Map(
    storedAssignments.map((row) => [row.traceId, row]),
  );
  const latestSummaries = storedSummaries.filter(
    (row): row is typeof row & { traceId: string } =>
      row.traceId !== null &&
      (membership === "current" || assignmentByTrace.has(row.traceId)),
  );
  const current = latestSummaries
    .sort(
      (a, b) =>
        b.unitStartTime.localeCompare(a.unitStartTime) ||
        a.traceId.localeCompare(b.traceId),
    )
    .map((summary) => ({
      summary,
      ...resolveTopicResult(
        summary,
        assignmentByTrace.get(summary.traceId),
        membership,
      ),
    }));
  const assignmentRuns = await getTopicRuns(projectId, [
    ...new Set(
      current.flatMap(({ assignment }) =>
        assignment?.topicId && assignment.runId && assignment.runId !== run?.id
          ? [assignment.runId]
          : [],
      ),
    ),
  ]);
  const definitions = [
    ...(run?.topics ?? []),
    ...assignmentRuns.flatMap((item) => item.topics),
  ];
  const topicByVersion = new Map(
    definitions.map((topic) => [topic.topicVersionId, topic]),
  );
  const topics = new Map<
    string,
    { assignment: TopicAssignment; count: number }
  >();
  const rows = current.map(({ summary, assignment, outcome }) => {
    const definition = assignment?.topicVersionId
      ? topicByVersion.get(assignment.topicVersionId)
      : undefined;
    if (assignment?.topicId) {
      const topic = topics.get(assignment.topicId);
      topics.set(assignment.topicId, {
        assignment:
          !topic || assignment.assignedAt > topic.assignment.assignedAt
            ? assignment
            : topic.assignment,
        count: (topic?.count ?? 0) + 1,
      });
    }
    return {
      facetVersion: summary.facetVersion,
      traceId: summary.traceId,
      unitStartTime: summary.unitStartTime,
      summary: summary.summary,
      outcome,
      topicId: assignment?.topicId ?? null,
      topicName: definition?.name ?? null,
    };
  });
  // Current map names take precedence; retired IDs keep their latest referenced name.
  const currentTopics = new Map(
    run?.topics.map((topic) => [topic.topicId, topic]),
  );
  return {
    facetId: facet.id,
    name: facet.name,
    facetVersion: version?.version ?? null,
    usableCount: latestSummaries.filter(
      (row) =>
        row.facetVersion === version?.version && row.state === "complete",
    ).length,
    awaitingCount: rows.filter((row) => row.outcome === "awaiting_map").length,
    topics: [...topics]
      .sort(
        ([, a], [, b]) =>
          b.count - a.count ||
          b.assignment.assignedAt.localeCompare(a.assignment.assignedAt),
      )
      .map(([id, topic]) => {
        const definition =
          currentTopics.get(id) ??
          topicByVersion.get(topic.assignment.topicVersionId ?? "");
        return {
          id,
          versionId:
            definition?.topicVersionId ?? topic.assignment.topicVersionId ?? "",
          runId: definition?.createdByRunId ?? topic.assignment.runId ?? "",
          name: definition?.name ?? "Unavailable topic",
          description: definition?.description ?? "",
          count: topic.count,
        };
      }),
    rows,
    map: run
      ? {
          runId: run.id,
          topics: run.topics.map((topic) => ({
            id: topic.topicId,
            versionId: topic.topicVersionId,
            runId: topic.createdByRunId,
            name: topic.name,
            description: topic.description,
          })),
        }
      : null,
  };
}

/** Current result per facet for one trace; summaries start within a few days of the trace. */
export async function traceFacetResults(
  projectId: string,
  traceId: string,
  timestamp: Date,
) {
  const slackMs = OBSERVATIONS_TO_TRACE_INTERVAL_DAYS * 86_400_000;
  // Narrow to the trace's exact source time so assignment reads prune to its minute.
  const unitTimeRange = await getTopicTraceUnitTimeRange(projectId, traceId, {
    from: new Date(timestamp.getTime() - slackMs),
    to: new Date(timestamp.getTime() + slackMs),
  });
  if (!unitTimeRange) return [];
  const { facets } = await currentTopicResults(projectId, unitTimeRange, {
    traceIds: [traceId],
  });
  return facets.map((facet) => {
    const row = facet.rows.find((item) => item.traceId === traceId);
    return {
      facetId: facet.facetId,
      name: facet.name,
      summary: row?.summary ?? null,
      outcome: row?.outcome ?? null,
      topicId: row?.topicId ?? null,
      topicName: row?.topicName ?? null,
      // Slot in the published map; picks the topic's color.
      topicIndex:
        facet.map?.topics.findIndex((topic) => topic.id === row?.topicId) ?? -1,
    };
  });
}
