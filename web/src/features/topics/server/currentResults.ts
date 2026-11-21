import { InvalidRequestError } from "@langfuse/shared";
import {
  TOPICS_MAX_TIME_RANGE_MS,
  topicTimeRangeSchema,
  type TopicAssignment,
  type TopicFacet,
  type TopicRun,
  type TopicSummary,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import {
  getTopicResultCounts,
  listCurrentTopicSummaries,
  OBSERVATIONS_TO_TRACE_INTERVAL_DAYS,
  type TopicAssignmentStatus,
  type TopicResultCondition,
  type TopicResultCursor,
  type TopicSummaryState,
} from "@langfuse/shared/src/server";
import {
  getCurrentTopicMapRows,
  getLatestFacetSummaries,
  getPublishedTopicRun,
  getTopicRuleMap,
  getTopicRun,
  getTopicRuns,
  getTopicTraceUnitTimeRange,
  hasStoredTopicSummaries,
  listTopicFacets,
  listTopicRules,
  readLatestTopicAssignments,
} from "@langfuse/shared/topics/server";
import { requireAnalysis } from "./slices";

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
  stored?: TopicAssignment,
) {
  const assignment =
    summary.state === "complete" &&
    stored?.projectId === summary.projectId &&
    stored.facetId === summary.facetId &&
    stored.facetVersion === summary.facetVersion &&
    stored.traceId === summary.traceId &&
    stored.unitStartTime === summary.unitStartTime &&
    stored.summaryProcessedAt === summary.processedAt
      ? stored
      : undefined;
  let outcome: string = summary.state;
  if (summary.state === "complete") outcome = "awaiting_map";
  if (assignment) outcome = assignment.topicId ? "assigned" : "outlier";
  return { assignment, outcome };
}

const DEFAULT_RESULT_WINDOW_MS = 7 * 86_400_000;

/**
 * The Topics page window of a facet: from its published map's clustering
 * cohort to now, so the page follows the latest map instead of a time filter.
 * Without a map, the last 7 days.
 */
function facetResultWindow(
  run: TopicRun | null,
  to = new Date(),
): TopicTimeRange {
  const cohort = topicTimeRangeSchema.safeParse(run?.config.timeRange);
  const from = cohort.success
    ? Math.max(
        cohort.data.from.getTime(),
        to.getTime() - TOPICS_MAX_TIME_RANGE_MS,
      )
    : to.getTime() - DEFAULT_RESULT_WINDOW_MS;
  return { from: new Date(from), to };
}

type TopicMapScope = { ruleId?: string; analysisId?: string };

/**
 * The map each facet shows and the window it counts. A rule's map, when the
 * project has several rules, and an analysis snapshot list only the traces
 * their run assigned, since summaries are shared across rules.
 */
type FacetMap = {
  facet: TopicFacet;
  run: TopicRun | null;
  window: TopicTimeRange;
  membersOnly: boolean;
  /** Analysis facets only: how the run ended. */
  outcome?: string | null;
};

async function resolveFacetMaps(
  projectId: string,
  scope: TopicMapScope,
  facets: TopicFacet[],
  timeRange?: TopicTimeRange,
): Promise<FacetMap[]> {
  if (scope.analysisId) {
    const execution = await requireAnalysis(projectId, scope.analysisId);
    return Promise.all(
      execution.facets.flatMap((progress) => {
        const facet = facets.find((item) => item.id === progress.facetId);
        if (!facet) return [];
        return [
          (async () => {
            const run = progress.runId
              ? await getTopicRun(projectId, progress.runId)
              : null;
            return {
              facet,
              run: run?.status === "completed" ? run : null,
              window: execution.input.timeRange,
              membersOnly: true,
              outcome: progress.outcome,
            };
          })(),
        ];
      }),
    );
  }
  // Only facets enabled on a rule get tabs; without rules, all show.
  const rules = await listTopicRules(projectId);
  const scoped = scope.ruleId
    ? rules.filter((rule) => rule.id === scope.ruleId)
    : rules;
  if (scope.ruleId && !scoped.length)
    throw new InvalidRequestError("Topic rule not found in this project.");
  const enabledFacetIds = scoped.length
    ? new Set(scoped.flatMap((rule) => rule.facetIds))
    : null;
  const enabled = facets.filter(
    (facet) => !enabledFacetIds || enabledFacetIds.has(facet.id),
  );
  const now = new Date();
  return Promise.all(
    enabled.map(async (facet) => {
      const run = scope.ruleId
        ? await ruleMap(
            projectId,
            scope.ruleId,
            facet.id,
            rules[0]?.id === scope.ruleId,
          )
        : await getPublishedTopicRun(projectId, facet.id);
      return {
        facet,
        run,
        window: timeRange ?? facetResultWindow(run, now),
        membersOnly: Boolean(scope.ruleId) && rules.length > 1,
      };
    }),
  );
}

/**
 * A rule's own map. Until its first refit, only the oldest rule, which setup
 * created, shows setup's snapshot; a later rule shows none rather than a map
 * fit on another rule's traces.
 */
async function ruleMap(
  projectId: string,
  ruleId: string,
  facetId: string,
  ownsSetupSnapshot: boolean,
) {
  const own = await getTopicRuleMap(projectId, ruleId, facetId);
  if (own || !ownsSetupSnapshot) return own;
  const serving = await getPublishedTopicRun(projectId, facetId);
  return serving?.ruleId ? null : serving;
}

/** Topic and status counts per facet map, aggregated in ClickHouse. */
async function facetMapCounts(projectId: string, maps: FacetMap[]) {
  // Facets whose maps share a cohort window share one count query.
  const groups = new Map<string, FacetMap[]>();
  for (const map of maps) {
    const key = `${map.window.from.getTime()}:${map.window.to.getTime()}`;
    groups.set(key, [...(groups.get(key) ?? []), map]);
  }
  const countsByFacet = new Map(
    (
      await Promise.all(
        [...groups.values()].map((group) =>
          getTopicResultCounts({
            projectId,
            window: group[0].window,
            facets: group.map(({ facet, run }) => ({
              facetId: facet.id,
              version: facet.versions[0]?.version ?? null,
              runId: run?.id ?? null,
            })),
          }),
        ),
      )
    )
      .flat()
      .map((count) => [count.facetId, count]),
  );
  return maps.map(({ facet, run, window, membersOnly, outcome }) => {
    const count = countsByFacet.get(facet.id)!;
    const current = new Map(run?.topics.map((topic) => [topic.topicId, topic]));
    const topics = count.topics.flatMap((topic) => {
      const definition = current.get(topic.topicId);
      return definition
        ? [
            {
              id: topic.topicId,
              versionId: definition.topicVersionId,
              runId: definition.createdByRunId,
              name: definition.name,
              description: definition.description,
              count: topic.count,
            },
          ]
        : [];
    });
    const members = count.assigned + count.outliers;
    return {
      facetId: facet.id,
      name: facet.name,
      facetVersion: facet.versions[0]?.version ?? null,
      window,
      usableCount: membersOnly ? members : count.usable,
      awaitingCount: membersOnly ? 0 : count.awaiting,
      counts: membersOnly
        ? {
            total: members,
            assigned: count.assigned,
            outlier: count.outliers,
            awaitingMap: 0,
            notApplicable: 0,
            insufficientInput: 0,
          }
        : {
            total: count.total,
            assigned: count.assigned,
            outlier: count.outliers,
            awaitingMap: count.awaiting,
            notApplicable: count.notApplicable,
            insufficientInput: count.insufficientInput,
          },
      topics,
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
      ...(outcome !== undefined ? { outcome } : {}),
    };
  });
}

/**
 * Topic and status counts per enabled facet. Without an explicit window, each
 * facet uses its published map's window. With a rule, facets and maps narrow
 * to that rule. Traces themselves are paged by `listTopicTraces`.
 */
export async function currentTopicResults(
  projectId: string,
  timeRange?: TopicTimeRange,
  { facetIds, ruleId }: { facetIds?: string[]; ruleId?: string } = {},
) {
  const facets = (await listTopicFacets(projectId)).filter(
    (facet) => !facetIds || facetIds.includes(facet.id),
  );
  if (!facets.length) return { hasStoredSummaries: false, facets: [] };
  const hasStoredSummaries = await hasStoredTopicSummaries(projectId);
  if (!hasStoredSummaries) return { hasStoredSummaries, facets: [] };
  const maps = await resolveFacetMaps(projectId, { ruleId }, facets, timeRange);
  return { hasStoredSummaries, facets: await facetMapCounts(projectId, maps) };
}

/** One analysis run's maps: its own snapshot over its fixed window, never current topics. */
export async function analysisTopicResults(
  projectId: string,
  executionId: string,
) {
  const execution = await requireAnalysis(projectId, executionId);
  const maps = await resolveFacetMaps(
    projectId,
    { analysisId: executionId },
    await listTopicFacets(projectId),
  );
  return {
    execution: {
      id: execution.id,
      status: execution.status,
      phase: execution.phase,
      createdAt: execution.createdAt,
      timeRange: execution.input.timeRange,
      ...execution.input.analysis,
      // Per-facet progress while the snapshot summarizes and groups.
      progress: execution.facets.map((facet) => ({
        facetId: facet.facetId,
        outcome: facet.outcome,
        requested: facet.counts.requested,
        complete: facet.counts.complete,
      })),
    },
    facets: await facetMapCounts(projectId, maps),
  };
}

/** Current result per trace, facet and rule map for a few traces, resolved independently of execution batches. */
async function currentTopicRows(
  projectId: string,
  timeRange: TopicTimeRange,
  traceIds: string[],
) {
  const facets = await listTopicFacets(projectId);
  const hasStoredSummaries =
    facets.length > 0 && (await hasStoredTopicSummaries(projectId));
  if (!hasStoredSummaries) return { hasStoredSummaries, facets: [] };
  // Only facets enabled on a rule get tabs; without rules, all show.
  const rules = await listTopicRules(projectId);
  const enabledFacetIds = rules.length
    ? new Set(rules.flatMap((rule) => rule.facetIds))
    : null;
  const ruleNames = new Map(rules.map((rule) => [rule.id, rule.name]));
  const shown = facets.filter(
    (facet) => !enabledFacetIds || enabledFacetIds.has(facet.id),
  );
  const allMaps = await getCurrentTopicMapRows(
    projectId,
    shown.map((facet) => facet.id),
  );
  const currentFacets = await Promise.all(
    shown.map(async (facet) => {
      const maps = allMaps.filter(({ run }) => run.facetId === facet.id);
      const [runs, storedAssignments, storedSummaries] = await Promise.all([
        getTopicRuns(
          projectId,
          maps.map(({ run }) => run.id),
        ),
        readLatestTopicAssignments(
          projectId,
          facet.id,
          maps.map(({ run }) => run.id),
          timeRange,
          traceIds,
        ),
        getLatestFacetSummaries(
          projectId,
          facet.id,
          undefined,
          timeRange,
          traceIds,
        ),
      ]);
      const summaries = storedSummaries.filter((row) => row.traceId !== null);
      // Rules sharing the facet each keep a map; a trace has a result in each.
      return (maps.length ? maps : [null]).map((map) => {
        const run = runs.find((item) => item.id === map?.run.id);
        const assignmentByTrace = new Map(
          storedAssignments
            .filter((row) => row.runId === map?.run.id)
            .map((row) => [row.traceId, row]),
        );
        const topicByVersion = new Map(
          run?.topics.map((topic) => [topic.topicVersionId, topic]),
        );
        return {
          facetId: facet.id,
          name: facet.name,
          runId: map?.run.id ?? null,
          ruleName: map?.ruleId ? (ruleNames.get(map.ruleId) ?? null) : null,
          rows: summaries.map((summary) => {
            const { assignment, outcome } = resolveTopicResult(
              summary,
              assignmentByTrace.get(summary.traceId),
            );
            return {
              traceId: summary.traceId,
              summary: summary.summary,
              outcome,
              topicId: assignment?.topicId ?? null,
              topicName: assignment?.topicVersionId
                ? (topicByVersion.get(assignment.topicVersionId)?.name ?? null)
                : null,
            };
          }),
          mapTopicIds: run?.topics.map((topic) => topic.topicId) ?? [],
        };
      });
    }),
  ).then((entries) => entries.flat());
  return { hasStoredSummaries, facets: currentFacets };
}

/** Current result per facet for one trace; summaries start within a few days of the trace. */
export async function traceFacetResults(
  projectId: string,
  traceId: string,
  timestamp: Date,
) {
  const slackMs = OBSERVATIONS_TO_TRACE_INTERVAL_DAYS * 86_400_000;
  // Narrow to the trace's exact source time so assignment reads prune to its minute.
  const unitTimeRange = await getTopicTraceUnitTimeRange(projectId, [traceId], {
    from: new Date(timestamp.getTime() - slackMs),
    to: new Date(timestamp.getTime() + slackMs),
  });
  if (!unitTimeRange) return [];
  const { facets } = await currentTopicRows(projectId, unitTimeRange, [
    traceId,
  ]);
  return facets.map((facet) => {
    const row = facet.rows.find((item) => item.traceId === traceId);
    return {
      facetId: facet.facetId,
      name: facet.name,
      runId: facet.runId,
      // Set when several rules map the facet, so each result says whose map it is.
      ruleName:
        facets.filter((item) => item.facetId === facet.facetId).length > 1
          ? facet.ruleName
          : null,
      summary: row?.summary ?? null,
      outcome: row?.outcome ?? null,
      topicId: row?.topicId ?? null,
      topicName: row?.topicName ?? null,
      // Slot in the published map; picks the topic's color.
      topicIndex: facet.mapTopicIds.indexOf(row?.topicId ?? ""),
    };
  });
}

const TOPIC_TRACES_PAGE_SIZE = 50;

/**
 * One page of a facet's traces with their current summary and topic, newest
 * first. Filters run in ClickHouse; a short page with a cursor means the scan
 * budget ran out, not the end.
 */
export async function listTopicTraces(input: {
  projectId: string;
  facetId: string;
  ruleId?: string;
  analysisId?: string;
  topicIds?: { operator: "any of" | "none of"; values: string[] };
  statuses?: {
    operator: "any of" | "none of";
    values: (TopicAssignmentStatus | TopicSummaryState)[];
  };
  assigned?: boolean;
  traceId?: string;
  cursor?: TopicResultCursor;
}) {
  const conditions: TopicResultCondition[] = [];
  if (input.topicIds)
    conditions.push({ column: "topicId", match: input.topicIds });
  if (input.statuses)
    conditions.push({ column: "assignmentStatus", match: input.statuses });
  if (input.assigned !== undefined)
    conditions.push({ column: "assigned", match: input.assigned });
  if (input.traceId)
    conditions.push({
      column: "traceId",
      match: { operator: "any of", values: [input.traceId] },
    });
  const facet = (await listTopicFacets(input.projectId)).find(
    (item) => item.id === input.facetId,
  );
  const [map] = facet
    ? await resolveFacetMaps(input.projectId, input, [facet])
    : [];
  if (!map || (map.membersOnly && !map.run))
    return { rows: [], nextCursor: null };
  const { run } = map;
  if (map.membersOnly)
    conditions.push({
      column: "assignmentStatus",
      match: { operator: "any of", values: ["assigned", "outlier"] },
    });
  const page = await listCurrentTopicSummaries({
    projectId: input.projectId,
    window: map.window,
    facetIds: [input.facetId],
    ...(run ? { publishedRunIds: [run.id] } : {}),
    conditions,
    orderBy: "timestamp.desc",
    limit: TOPIC_TRACES_PAGE_SIZE,
    cursor: input.cursor,
    includeAssignment: true,
    truncateSummaries: false,
  });
  const names = new Map(
    run?.topics.map((topic) => [topic.topicVersionId, topic.name]),
  );
  return {
    rows: page.rows.map((row) => {
      const topicVersionId = row.assignment?.topicVersionId;
      return {
        traceId: row.traceId,
        unitStartTime: row.timestamp.toISOString(),
        facetVersion: row.facetVersion,
        summary: row.summary,
        outcome: row.assignment?.status ?? row.state,
        topicId: row.assignment?.topicId ?? null,
        topicName: topicVersionId ? (names.get(topicVersionId) ?? null) : null,
      };
    }),
    nextCursor: page.next ?? null,
  };
}
