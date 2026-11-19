import { prisma } from "../../../src/db";
import { rangeToString } from "../../../src/utils/dateRanges";
import { env } from "../../../src/env";
import { EventsAggQueryBuilder } from "../../../src/server/queries/clickhouse-sql/event-query-builder";
import {
  clickhouseClient,
  createEvent,
  createEventsCh,
  createTraceScore,
  createSessionScore,
  createScoresCh,
  type EventRecordInsertType,
  type ScoreRecordInsertType,
} from "../../../src/server";
import { buildDashboardStoryDefinition } from "./dashboard-story-definition";
import { buildDashboardResearchReport } from "./dashboard-research-report";
import { jitter, utcDayStartMs } from "./rng";
import { type ScenarioDefinition, SeedError } from "./types";

const DAY_MS = 86_400_000;
const BATCH_SIZE = 10_000;
const FIXTURE_VERSION = 2;
const DEFAULT_PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const names = [
  "Support answer",
  "Document search",
  "Release assistant",
  "Invoice extraction",
  "Code review",
];

const observationLatency = (seed: number, index: number) => {
  const traceIndex = Math.floor(index / 3);
  return traceIndex % 97 === 0
    ? 45000 + jitter(seed, index + 3, 60000)
    : 100 + jitter(seed, index + 5, index % 3 === 0 ? 9000 : 4000);
};

const metadataFor = (index: number): Record<string, string> => {
  const position = index % 3000;
  let cohort = "neither";
  if (position < 1200) cohort = "abc-only";
  else if (position < 2100) cohort = "bbc-only";
  else if (position < 2700) cohort = "both";
  const presentValue = ["", "null", "0", "false", '"value"'][index % 5];
  return {
    scenario: "dashboard-story",
    workload: ["support", "search", "coding"][index % 3],
    region: ["eu", "us", "apac"][Math.floor(index / 3) % 3],
    "literal.dot": '"literal key"',
    nested: '{"key":"nested value"}',
    cohort,
    ...(position < 1200 || (position >= 2100 && position < 2700)
      ? { abc: presentValue }
      : {}),
    ...(position >= 1200 && position < 2700 ? { bbc: presentValue } : {}),
  };
};

const readSeedTruth = async (projectId: string, from: number, end: number) => {
  const eventCounts = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.project_id",
    selectExpression:
      "count() AS observations, uniqExact(e.trace_id) AS traces, countIf(has(e.metadata_names, 'abc')) AS abc, countIf(has(e.metadata_names, 'bbc')) AS bbc, countIf(has(e.metadata_names, 'abc') AND has(e.metadata_names, 'bbc')) AS both, countIf(has(e.metadata_names, 'abc') OR has(e.metadata_names, 'bbc')) AS union, countIf(NOT has(e.metadata_names, 'abc') AND NOT has(e.metadata_names, 'bbc')) AS neither",
  })
    .whereRaw(
      "e.start_time >= fromUnixTimestamp64Milli({from:Int64}) AND e.start_time < fromUnixTimestamp64Milli({end:Int64})",
      { from, end },
    )
    .buildWithParams();
  const result = await clickhouseClient().query({
    query: eventCounts.query,
    query_params: eventCounts.params,
    format: "JSONEachRow",
  });
  const [row] = await result.json<Record<string, string | number>>();
  const counts = Object.fromEntries(
    Object.entries(row ?? {}).map(([key, value]) => [key, Number(value)]),
  );
  const scoreResult = await clickhouseClient().query({
    query:
      "SELECT uniqExact(id) AS scores FROM scores WHERE project_id = {projectId:String}",
    query_params: { projectId },
    format: "JSONEachRow",
  });
  const [scoreRow] = await scoreResult.json<{ scores: string }>();
  const latestEvents = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.span_id, e.start_time",
    selectExpression:
      "e.span_id AS span_id, argMax(tuple(e.parent_span_id, e.start_time, e.end_time), e.event_ts) AS latest",
  })
    .whereRaw(
      "e.start_time >= fromUnixTimestamp64Milli({from:Int64}) AND e.start_time < fromUnixTimestamp64Milli({end:Int64})",
      { from, end },
    )
    .buildWithParams();
  const containmentResult = await clickhouseClient().query({
    query: `WITH latest_events AS (${latestEvents.query}) SELECT count() AS violations FROM latest_events child INNER JOIN latest_events parent ON child.latest.1 = parent.span_id WHERE child.latest.2 < parent.latest.2 OR (parent.latest.3 IS NOT NULL AND (child.latest.2 > parent.latest.3 OR child.latest.3 > parent.latest.3))`,
    query_params: latestEvents.params,
    format: "JSONEachRow",
  });
  const [containmentRow] = await containmentResult.json<{
    violations: string;
  }>();
  return {
    ...counts,
    scores: Number(scoreRow?.scores ?? 0),
    parentContainmentViolations: Number(containmentRow?.violations ?? 0),
  } as Record<string, number>;
};

export const dashboardStoryScenario: ScenarioDefinition = {
  name: "dashboard-story",
  description:
    "A v4 dashboard story: independent metadata cohorts, rich scores, 12 current/preset comparison pairs and editable multi-query charts. Requires LANGFUSE_EXPERIMENTAL_DASHBOARD_STUDIO_ENABLED=true. Creates a dedicated synthetic project by default.",
  supportsV4: true,
  flags: [
    {
      flag: "observations",
      type: "number",
      default: 3000,
      description:
        "observation count, a multiple of 3000 up to 999000; use 30000 or 300000 for scale tiers",
    },
    {
      flag: "days",
      type: "number",
      default: 90,
      description:
        "number of complete UTC days of deterministic traffic (1-366)",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "native v4 events; required for this scenario",
    },
  ],
  run: async (ctx, params) => {
    if (
      !ctx.dryRun &&
      env.LANGFUSE_EXPERIMENTAL_DASHBOARD_STUDIO_ENABLED !== "true"
    )
      throw new SeedError(
        "Dashboard studio is not enabled",
        "set LANGFUSE_EXPERIMENTAL_DASHBOARD_STUDIO_ENABLED=true only after all running servers can read and preserve query/text placements",
      );
    const startedAt = Date.now();
    const observationCount = Number(params.observations);
    const days = Number(params.days);
    if (
      observationCount < 3000 ||
      observationCount > 999000 ||
      observationCount % 3000 !== 0
    )
      throw new SeedError(
        "--observations must be a multiple of 3000 between 3000 and 999000",
        "use --observations 3000, 30000 or 300000",
      );
    if (days < 1 || days > 366)
      throw new SeedError("--days must be between 1 and 366");
    if (!params.v4)
      throw new SeedError(
        "dashboard-story requires native v4 events",
        "omit --v4 to use its true default",
      );
    const projectId =
      ctx.projectId === DEFAULT_PROJECT_ID
        ? `${ctx.idPrefix}-project`
        : ctx.projectId;
    const dashboardId = `${ctx.idPrefix}-dashboard`;
    const reportId = `${ctx.idPrefix}-report`;
    const traceCount = observationCount / 3;
    const scoreEvery = observationCount / 3000;
    const scoreTraceCount = Math.ceil(traceCount / scoreEvery);
    const scoreCount = scoreTraceCount * 6 + 40;
    const end = utcDayStartMs();
    const from = end - days * DAY_MS;
    const factor = observationCount / 3000;
    const truth = {
      observations: observationCount,
      traces: traceCount,
      abc: 1800 * factor,
      bbc: 1500 * factor,
      both: 600 * factor,
      union: 2700 * factor,
      neither: 300 * factor,
      scores: scoreCount,
      parentContainmentViolations: 0,
    };
    const range = encodeURIComponent(
      rangeToString({ from: new Date(from), to: new Date(end) }),
    );
    const dashboardLink = `${ctx.baseUrl}/project/${projectId}/dashboards/${dashboardId}?dateRange=${range}`;
    const links = [
      dashboardLink,
      `${ctx.baseUrl}/project/${projectId}/traces?dateRange=${range}`,
      `${ctx.baseUrl}/project/${projectId}/scores?dateRange=${range}`,
      `${ctx.baseUrl}/project/${projectId}/dashboards/${reportId}/report?dateRange=${range}`,
    ];
    const counts = {
      ...truth,
      projects: projectId === ctx.projectId ? 0 : 1,
      dashboards: 2,
      sessions: 40,
      legacyComparisons: 12,
    };
    const definition = buildDashboardStoryDefinition(observationCount, days);
    const report = buildDashboardResearchReport(definition);
    if (ctx.dryRun)
      return {
        scenario: "dashboard-story",
        target: "clickhouse",
        params,
        projectId,
        environment: ctx.environment,
        traceIds: [`${ctx.idPrefix}-trace-0`],
        sessionIds: [`${ctx.idPrefix}-session-0`],
        counts,
        verified: {},
        links,
        dryRun: true,
        durationMs: Date.now() - startedAt,
      };

    const source = await prisma.project.findUniqueOrThrow({
      where: { id: ctx.projectId },
      select: { orgId: true },
    });
    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      select: { metadata: true },
    });
    if (
      existing &&
      projectId !== DEFAULT_PROJECT_ID &&
      (existing.metadata as Record<string, unknown> | null)?.seedScenario !==
        "dashboard-story"
    )
      throw new SeedError(
        `Project ${projectId} is not owned by this synthetic scenario`,
        "choose a fresh --id-prefix; do not overwrite an existing project",
      );
    const existingEnvironment =
      (existing?.metadata as Record<string, unknown> | null)?.environment ??
      "default";
    const existingFixtureVersion =
      (existing?.metadata as Record<string, unknown> | null)?.fixtureVersion ??
      0;
    if (existing && existingFixtureVersion !== FIXTURE_VERSION)
      throw new SeedError(
        "The existing fixture uses an older scenario version",
        "use a fresh --id-prefix; event versions must not be rewritten",
      );
    const existingMetadata = existing?.metadata as
      | Record<string, unknown>
      | undefined;
    if (
      existing &&
      (existingMetadata?.seed !== ctx.seed ||
        existingMetadata?.from !== new Date(from).toISOString() ||
        existingMetadata?.to !== new Date(end).toISOString())
    )
      throw new SeedError(
        "The existing fixture uses a different seed or time window",
        "use a fresh --id-prefix when changing the seed or time window",
      );
    if (existing && existingEnvironment !== ctx.environment)
      throw new SeedError(
        "The existing fixture uses a different environment",
        "use a fresh --id-prefix when changing --environment",
      );
    await prisma.project.upsert({
      where: { id: projectId },
      create: {
        id: projectId,
        orgId: source.orgId,
        name: "Dashboard examples",
        hasTraces: true,
        metadata: {
          seedScenario: "dashboard-story",
          fixtureVersion: FIXTURE_VERSION,
          seed: ctx.seed,
          environment: ctx.environment,
          truth,
          from: new Date(from).toISOString(),
          to: new Date(end).toISOString(),
        },
      },
      update: {
        name: "Dashboard examples",
        hasTraces: true,
        metadata: {
          seedScenario: "dashboard-story",
          fixtureVersion: existingFixtureVersion,
          seed: ctx.seed,
          environment: ctx.environment,
          truth,
          from: new Date(from).toISOString(),
          to: new Date(end).toISOString(),
        },
      },
    });
    const sourceMemberships = await prisma.projectMembership.findMany({
      where: { projectId: ctx.projectId },
      select: { orgMembershipId: true, userId: true, role: true },
    });
    await prisma.projectMembership.createMany({
      data: sourceMemberships.map((member) => ({ ...member, projectId })),
      skipDuplicates: true,
    });
    await prisma.traceSession.createMany({
      data: Array.from({ length: 40 }, (_, i) => ({
        id: `${ctx.idPrefix}-session-${i}`,
        projectId,
        environment: ctx.environment,
        createdAt: new Date(from),
      })),
      skipDuplicates: true,
    });
    for (const [suffix, name, dataType] of [
      ["quality", "quality", "NUMERIC"],
      ["accepted", "accepted", "BOOLEAN"],
      ["outcome", "outcome", "CATEGORICAL"],
    ] as const) {
      await prisma.scoreConfig.upsert({
        where: { id: `${ctx.idPrefix}-${suffix}-config` },
        create: {
          id: `${ctx.idPrefix}-${suffix}-config`,
          projectId,
          name,
          dataType,
          ...(dataType === "CATEGORICAL"
            ? {
                categories: [
                  { label: "success", value: 0 },
                  { label: "review", value: 1 },
                  { label: "blocked", value: 2 },
                ],
              }
            : { minValue: 0, maxValue: 1 }),
        },
        update: {},
      });
    }
    ctx.log(
      `writing ${observationCount} native v4 observations, ${traceCount} traces and ${scoreCount} scores over ${days} days into ${projectId}`,
    );
    const existingTruth = await readSeedTruth(projectId, from, end);
    const dataAlreadyPresent =
      existingFixtureVersion === FIXTURE_VERSION &&
      Object.entries(truth).every(
        ([key, expected]) => existingTruth[key] === expected,
      );
    if (existingTruth.observations > 0 && !dataAlreadyPresent)
      throw new SeedError(
        "The existing fixture does not match the requested data exactly",
        "use a fresh --id-prefix; partial or different event fixtures must not be rewritten",
      );
    if (dataAlreadyPresent)
      ctx.log(
        "matching fixture already present; keeping event versions unchanged",
      );
    for (
      let start = dataAlreadyPresent ? observationCount : 0;
      start < observationCount;
      start += BATCH_SIZE
    ) {
      const events: EventRecordInsertType[] = [];
      const scores: ScoreRecordInsertType[] = [];
      for (
        let index = start;
        index < Math.min(observationCount, start + BATCH_SIZE);
        index++
      ) {
        const traceIndex = Math.floor(index / 3);
        const offset = index % 3;
        const traceId = `${ctx.idPrefix}-trace-${traceIndex}`;
        const rootId = `${traceId}-root`;
        const id = offset === 0 ? rootId : `${traceId}-${offset}`;
        const day = 1 + (traceIndex % days);
        const timestamp =
          end -
          day * DAY_MS +
          jitter(ctx.seed, traceIndex, DAY_MS - 120000) +
          offset * 20;
        const latency =
          offset === 0
            ? Math.max(
                observationLatency(ctx.seed, index),
                20 + observationLatency(ctx.seed, index + 1),
                40 + observationLatency(ctx.seed, index + 2),
              )
            : observationLatency(ctx.seed, index);
        const isGeneration =
          offset === 1 || (offset === 0 && traceIndex % 13 === 0);
        const inputTokens = isGeneration
          ? 50 +
            jitter(ctx.seed, index + 7, 5000) * (traceIndex % 89 === 0 ? 30 : 1)
          : 0;
        const outputTokens = isGeneration
          ? 20 + jitter(ctx.seed, index + 11, 1500)
          : 0;
        const inputCost = inputTokens * 0.000002;
        const outputCost = outputTokens * 0.000008;
        const metadata = metadataFor(index);
        const metadataNames = Object.keys(metadata).sort();
        let parentSpanId = rootId;
        if (offset === 0)
          parentSpanId =
            traceIndex % 17 === 0 ? `${ctx.idPrefix}-external-parent` : "";
        let observationName = [
          "Search documents",
          "Fetch account",
          "Validate result",
          "Store response",
        ][traceIndex % 4];
        if (offset === 0) observationName = names[traceIndex % names.length];
        else if (offset === 1) observationName = "Generate answer";
        let observationType = offset === 0 ? "AGENT" : "TOOL";
        if (isGeneration)
          observationType = traceIndex % 10 === 0 ? "EMBEDDING" : "GENERATION";
        let level = "DEFAULT";
        if (traceIndex % 19 === 0 && offset === 1) level = "ERROR";
        else if (traceIndex % 11 === 0 && offset === 2) level = "WARNING";
        events.push(
          createEvent({
            id,
            span_id: id,
            trace_id: traceId,
            project_id: projectId,
            environment: ctx.environment,
            parent_span_id: parentSpanId,
            is_app_root: offset === 0 && traceIndex % 17 === 0,
            trace_name: names[traceIndex % names.length],
            name: observationName,
            type: observationType,
            start_time: timestamp,
            end_time:
              traceIndex % 101 === 0 && offset === 0
                ? null
                : timestamp + latency,
            completion_start_time: isGeneration
              ? timestamp + Math.min(latency / 3, 500)
              : null,
            user_id:
              traceIndex % 37 === 0
                ? null
                : `studio-user-${String((traceIndex % 40) + 1).padStart(2, "0")}`,
            session_id: `${ctx.idPrefix}-session-${traceIndex % 40}`,
            provided_model_name: isGeneration
              ? `studio-model-${String((traceIndex % 32) + 1).padStart(2, "0")}`
              : null,
            provided_usage_details: {},
            usage_details: {
              input: inputTokens,
              output: outputTokens,
              total: inputTokens + outputTokens,
            },
            provided_cost_details: {},
            cost_details: {
              input: inputCost,
              output: outputCost,
              total: inputCost + outputCost,
            },
            model_id: null,
            level,
            status_message:
              traceIndex % 19 === 0 && offset === 1
                ? "Synthetic provider timeout"
                : null,
            metadata_names: metadataNames,
            metadata_values: metadataNames.map((key) => metadata[key]),
            tags: [
              "synthetic",
              "dashboard-story",
              traceIndex % 2 ? "release:b" : "release:a",
            ],
            version: `v${(traceIndex % 3) + 1}`,
            release: `release-${(traceIndex % 4) + 1}`,
            input: JSON.stringify({
              request: `Synthetic request ${traceIndex}`,
              step: offset,
            }),
            output:
              offset === 2 && traceIndex % 7 === 0
                ? ""
                : JSON.stringify({
                    answer: "Synthetic answer",
                    itemCount: traceIndex % 12,
                  }),
            created_at: timestamp,
            updated_at: timestamp + FIXTURE_VERSION,
            event_ts: timestamp + FIXTURE_VERSION,
            ingestion_api_key: "pk-lf-seed-dashboard-story",
            ingestion_sdk_name: "@langfuse/seed",
            ingestion_sdk_version: "1.0.0",
          }),
        );
        if (offset === 0 && traceIndex % scoreEvery === 0) {
          const scoreBase = {
            project_id: projectId,
            trace_id: traceId,
            environment: ctx.environment,
            timestamp: timestamp + 60000,
            created_at: timestamp + 60000,
            updated_at: timestamp + 60000,
            event_ts: timestamp + 60000,
            metadata: { scenario: "dashboard-story" },
            source: "API" as const,
          };
          for (const [attachment, observationId] of [
            ["trace", null],
            ["root", rootId],
            ["child", `${traceId}-1`],
          ] as const)
            scores.push(
              createTraceScore({
                ...scoreBase,
                id: `${traceId}-quality-${attachment}`,
                name: "quality",
                observation_id: observationId,
                data_type: "NUMERIC",
                value: (20 + (traceIndex % 81)) / 100,
                config_id: `${ctx.idPrefix}-quality-config`,
              }),
            );
          scores.push(
            createTraceScore({
              ...scoreBase,
              id: `${traceId}-accepted`,
              name: "accepted",
              observation_id: `${traceId}-1`,
              data_type: "BOOLEAN",
              value: traceIndex % 4 === 0 ? 0 : 1,
              config_id: `${ctx.idPrefix}-accepted-config`,
            }),
          );
          scores.push(
            createTraceScore({
              ...scoreBase,
              id: `${traceId}-outcome`,
              name: "outcome",
              observation_id: rootId,
              data_type: "CATEGORICAL",
              value: traceIndex % 3,
              string_value: ["success", "review", "blocked"][traceIndex % 3],
              config_id: `${ctx.idPrefix}-outcome-config`,
            }),
          );
          scores.push(
            createTraceScore({
              ...scoreBase,
              id: `${traceId}-delayed`,
              name: "quality",
              observation_id: `${traceId}-1`,
              data_type: "NUMERIC",
              value: 0.95,
              timestamp:
                end - (traceIndex % 2 === 0 ? 1 : days + 3) * DAY_MS + 120000,
              config_id: `${ctx.idPrefix}-quality-config`,
            }),
          );
        }
      }
      await createEventsCh(events);
      if (scores.length) await createScoresCh(scores);
      ctx.log(
        `observations ${Math.min(observationCount, start + BATCH_SIZE)}/${observationCount}`,
      );
    }
    if (!dataAlreadyPresent)
      await createScoresCh(
        Array.from({ length: 40 }, (_, i) =>
          createSessionScore({
            id: `${ctx.idPrefix}-session-quality-${i}`,
            project_id: projectId,
            session_id: `${ctx.idPrefix}-session-${i}`,
            environment: ctx.environment,
            name: "quality",
            data_type: "NUMERIC",
            value: 0.5 + i / 100,
            timestamp: end - DAY_MS + i * 1000,
            created_at: end - DAY_MS,
            updated_at: end - DAY_MS,
            event_ts: end - DAY_MS,
            metadata: { scenario: "dashboard-story" },
            source: "API",
          }),
        ),
      );

    const verified = await readSeedTruth(projectId, from, end);
    for (const [key, expected] of Object.entries(truth))
      if (verified[key] !== expected)
        throw new SeedError(
          `dashboard-story readback ${key}: expected ${expected}, got ${verified[key]}`,
          "use a fresh --id-prefix when changing fixture size or day window",
        );
    await prisma.dashboard.upsert({
      where: { id: dashboardId },
      create: {
        id: dashboardId,
        projectId,
        name: "Dashboard capabilities",
        description: `Dashboard examples with synthetic observations. Full ${days}-day fixture; ${observationCount} observations.`,
        definition,
        filters: [],
      },
      update: {
        name: "Dashboard capabilities",
        definition,
        description: `Dashboard examples with synthetic observations. Full ${days}-day fixture; ${observationCount} observations.`,
      },
    });
    await prisma.dashboard.upsert({
      where: { id: reportId },
      create: {
        id: reportId,
        projectId,
        name: "An investigation into LLM operations",
        description: `Dashboard research notebook · ${observationCount.toLocaleString("en-US")} synthetic observations over ${days} days`,
        definition: report,
        filters: [],
      },
      update: {},
    });
    await prisma.project.update({
      where: { id: projectId },
      data: {
        homeDashboardId: dashboardId,
        metadata: {
          seedScenario: "dashboard-story",
          fixtureVersion: FIXTURE_VERSION,
          seed: ctx.seed,
          environment: ctx.environment,
          truth,
          from: new Date(from).toISOString(),
          to: new Date(end).toISOString(),
        },
      },
    });
    ctx.log(
      `truth verified: abc=${verified.abc}; bbc=${verified.bbc}; overlap=${verified.both}; distinct union=${verified.union}; range=${range}`,
    );
    return {
      scenario: "dashboard-story",
      target: "clickhouse",
      params,
      projectId,
      environment: ctx.environment,
      traceIds: [`${ctx.idPrefix}-trace-0`],
      sessionIds: [`${ctx.idPrefix}-session-0`],
      counts,
      verified,
      links,
      dryRun: false,
      durationMs: Date.now() - startedAt,
    };
  },
};
