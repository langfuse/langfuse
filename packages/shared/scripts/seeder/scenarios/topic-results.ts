import { prisma } from "../../../src/db";
import { clickhouseClient } from "../../../src/server";
import {
  ensureDefaultTopicFacets,
  writeTopicDefinitions,
} from "../../../src/server/topics";
import { utcDayStartMs } from "./rng";
import { ScenarioDefinition, SeedError, SeedSummary } from "./types";
import { countRows, escapeLike } from "./verify";

const TOPICS_PER_FACET = 20;
const EMBEDDING_DIMENSIONS = 16;
const TRACE_NAMES = [
  "checkout",
  "support-chat",
  "search",
  "onboarding",
  "billing-agent",
  "code-review",
  "travel-planner",
  "rag-answer",
];
const SUMMARY_PHRASES = [
  "The user asked for a refund of a duplicate subscription charge and the assistant explained how to contact billing support with both invoice numbers.",
  "The user requested a rainy-day itinerary for a city trip; the assistant suggested indoor museums, covered markets and checking the forecast again.",
  "The user reported a TypeScript runtime error when reading a nested property; the assistant traced it to a missing profile and proposed validation.",
  "The user asked how to export invoices with tax details for accounting; the assistant pointed to billing settings and invoice history.",
  "The user wanted help packing for cool weather with showers; the assistant recommended layers, a waterproof jacket and an umbrella.",
];

// Per-row variation is a stateless hash of (seed, trace index, facet), so
// ORDER BY keys stay identical across re-runs and ReplacingMergeTree overwrites.
const rowSql = `
  SELECT
    {projectId:String} AS project_id,
    facet_id,
    toUInt32(1) AS facet_version,
    concat({traceIdPrefix:String}, toString(number)) AS trace_id,
    if(number % 3 = 0, concat({sessionIdPrefix:String}, toString(number % 1000)), '') AS session_id,
    {environment:String} AS environment,
    {traceNames:Array(String)}[number % length({traceNames:Array(String)}) + 1] AS trace_name,
    fromUnixTimestamp64Milli(toInt64({anchorMs:Int64} - intDiv(number * {spanMs:Int64}, {count:UInt64})), 'UTC') AS unit_start_time,
    cityHash64({seed:UInt64}, number, facet_id) AS h,
    multiIf(h % 100 < 80, 'complete', h % 100 < 95, 'not_applicable', 'insufficient_input') AS state,
    unit_start_time + INTERVAL 1 HOUR AS processed_at
  FROM numbers({count:UInt64})
  ARRAY JOIN {facetIds:Array(String)} AS facet_id`;

const summariesInsertSql = (reprocessed: boolean) => `
  INSERT INTO topic_facet_summaries (project_id, facet_id, facet_version,
    trace_id, session_id, environment, trace_name, unit_start_time,
    processing_state, summary, embedding, transcript_id, transcript_version,
    summary_model, embedding_model, processed_at, metadata)
  SELECT project_id, facet_id, facet_version, trace_id, session_id,
    environment, trace_name, unit_start_time, state,
    if(state = 'complete', concat({phrases:Array(String)}[h % length({phrases:Array(String)}) + 1], ' Trace ', trace_id, '.'), ''),
    if(state = 'complete', arrayMap(i -> toFloat32(((h + i * 7919) % 2000) / 1000 - 1), range({dimensions:UInt32})), []),
    concat('seed-', trace_id), 'seed', 'seed-summary-model', 'seed-embedding-model',
    ${reprocessed ? "processed_at + INTERVAL 2 HOUR" : "processed_at"}, '{}'
  FROM (${rowSql})
  ${reprocessed ? "WHERE state = 'complete' AND intDiv(h, 100) % 20 = 0" : ""}`;

const assignmentsInsertSql = `
  INSERT INTO topic_assignments (project_id, facet_id, facet_version,
    trace_id, session_id, environment, trace_name, unit_start_time,
    summary_processed_at, clustering_run_id, topic_id, topic_version_id,
    distance, runner_up_distance, origin, assigned_at)
  SELECT project_id, facet_id, facet_version, trace_id, session_id,
    environment, trace_name, unit_start_time, processed_at,
    {runIds:Array(String)}[indexOf({facetIds:Array(String)}, facet_id)],
    if(intDiv(h, 100) % 10 = 0, '', concat({topicIdPrefix:String}, toString(indexOf({facetIds:Array(String)}, facet_id)), '-', toString(intDiv(h, 1000) % {topicsPerFacet:UInt32}))),
    if(intDiv(h, 100) % 10 = 0, '', concat({topicIdPrefix:String}, toString(indexOf({facetIds:Array(String)}, facet_id)), '-', toString(intDiv(h, 1000) % {topicsPerFacet:UInt32}), '-v1')),
    0.1, 0.2, 'initial', processed_at + INTERVAL 1 HOUR
  FROM (${rowSql})
  WHERE state = 'complete'`;

export const topicResultsScenario: ScenarioDefinition = {
  name: "topic-results",
  description:
    "Bulk Topics results for performance work on the Topics reader: per-trace summaries for every default facet, a completed clustering run with named topics per facet, and assignments, via numbers() SQL. No model calls.",
  supportsV4: false,
  flags: [
    {
      flag: "traces",
      type: "number",
      default: 100_000,
      description: "number of traces; each gets one summary per default facet",
    },
    {
      flag: "days",
      type: "number",
      default: 7,
      description: "spread unit start times over the past N days",
    },
  ],
  run: async (ctx, params): Promise<SeedSummary> => {
    const startedAt = Date.now();
    const traces = params["traces"] as number;
    const days = params["days"] as number;
    if (!Number.isInteger(traces) || traces < 1)
      throw new SeedError(
        `--traces must be a positive integer, got ${traces}`,
        "pass e.g. --traces 100000",
      );
    if (!(days > 0))
      throw new SeedError(
        `--days must be > 0, got ${days}`,
        "pass e.g. --days 7",
      );

    const traceIdPrefix = `${ctx.idPrefix}-topic-trace-`;
    const topicIdPrefix = `${ctx.idPrefix}-topic-`;
    const links = [`${ctx.baseUrl}/project/${ctx.projectId}/topics`];
    const base = {
      scenario: "topic-results",
      target: "clickhouse" as const,
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [`${traceIdPrefix}0`],
      sessionIds: [],
      links,
    };
    if (ctx.dryRun)
      return {
        ...base,
        counts: { traces, facets: 4 },
        verified: {},
        dryRun: true,
        durationMs: Date.now() - startedAt,
      };

    const facets = (await ensureDefaultTopicFacets(ctx.projectId)).filter(
      (facet) => facet.isBuiltIn,
    );
    const facetIds = facets.map((facet) => facet.id);
    const runIds = facetIds.map((_, index) => `${ctx.idPrefix}-run-${index}`);
    const topicVersionIds = (facetIndex: number) =>
      Array.from(
        { length: TOPICS_PER_FACET },
        (_, topic) => `${topicIdPrefix}${facetIndex + 1}-${topic}-v1`,
      );
    for (const [index, facetId] of facetIds.entries()) {
      const run = {
        projectId: ctx.projectId,
        facetId,
        facetVersion: 1,
        status: "completed",
        finishedAt: new Date(utcDayStartMs()),
        topicVersionIds: topicVersionIds(index),
      };
      await prisma.topicClusteringRun.upsert({
        where: { id: runIds[index] },
        create: { id: runIds[index], ...run },
        update: run,
      });
    }
    await writeTopicDefinitions(
      facets.flatMap((facet, index) =>
        topicVersionIds(index).map((topicVersionId, topic) => ({
          topicVersionId,
          projectId: ctx.projectId,
          topicId: topicVersionId.slice(0, -"-v1".length),
          createdByRunId: runIds[index],
          createdAt: new Date(utcDayStartMs()).toISOString(),
          tags: [],
          name: `${facet.name} topic ${topic + 1}`,
          description: `Seeded ${facet.name} topic ${topic + 1}`,
          centroid: Array<number>(EMBEDDING_DIMENSIONS).fill(0.1),
          radius: 0.5,
          representativeSummaries: [],
          metadata: {},
        })),
      ),
    );

    const queryParams = {
      projectId: ctx.projectId,
      environment: ctx.environment,
      facetIds,
      runIds,
      traceIdPrefix,
      sessionIdPrefix: `${ctx.idPrefix}-topic-session-`,
      topicIdPrefix,
      traceNames: TRACE_NAMES,
      phrases: SUMMARY_PHRASES,
      anchorMs: utcDayStartMs(),
      spanMs: Math.round(days * 86_400_000),
      count: traces,
      seed: ctx.seed,
      dimensions: EMBEDDING_DIMENSIONS,
      topicsPerFacet: TOPICS_PER_FACET,
    };
    ctx.log(
      `bulk-inserting Topics results for ${traces} traces x ${facetIds.length} facets over ${days} day(s)`,
    );
    for (const query of [
      summariesInsertSql(false),
      summariesInsertSql(true),
      assignmentsInsertSql,
    ])
      await clickhouseClient().command({
        query,
        query_params: queryParams,
        clickhouse_settings: { wait_end_of_query: 1 },
      });

    const where = `project_id = {projectId: String} AND trace_id LIKE {prefix: String}`;
    const readbackParams = {
      projectId: ctx.projectId,
      prefix: `${escapeLike(traceIdPrefix)}%`,
    };
    const verified = {
      traces: await countRows(
        "topic_facet_summaries",
        where,
        readbackParams,
        "uniqExact(trace_id)",
      ),
      summaries: await countRows(
        "topic_facet_summaries",
        where,
        readbackParams,
        "uniqExact(facet_id, trace_id)",
      ),
      assignments: await countRows(
        "topic_assignments",
        where,
        readbackParams,
        "uniqExact(facet_id, trace_id)",
      ),
    };
    const expectedSummaries = traces * facetIds.length;
    if (
      verified.traces !== traces ||
      verified.summaries !== expectedSummaries ||
      verified.assignments === 0
    )
      throw new SeedError(
        `Readback mismatch: expected ${traces} traces and ${expectedSummaries} trace/facet summaries, found ${verified.traces} / ${verified.summaries} (${verified.assignments} assignments)`,
      );

    return {
      ...base,
      counts: {
        traces,
        facets: facetIds.length,
        summaries: expectedSummaries,
        topics: facetIds.length * TOPICS_PER_FACET,
      },
      verified,
      dryRun: false,
      durationMs: Date.now() - startedAt,
    };
  },
};
