import { prisma } from "../../../src/db";
import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createEventsCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink, tracesListLink } from "./verify";

// ---------------------------------------------------------------------------
// A project in the "action needed" state for the v4 upgrade panel, so the
// migration surfaces (nav pill, side panel, modal, status page) can be worked
// on without hunting for a real project that still has legacy traffic.
//
// The panel derives every action item from a different source, so this
// scenario has to write all of them:
//
//  - Update SDK              events_core ingestion attribution below the
//                            current SDK major (see LANGFUSE_SDK_LATEST_MAJOR)
//  - Update OTel             an OTel series on the delayed dual-write path
//  - Upgrade Instrumentation ingestion with no SDK attribution at all
//  - Update Evals            an ACTIVE trace-target evaluator in Postgres
//  - Migrate Integrations    an enabled export on the legacy export source
//
// Deliberately NOT covered: the Migrate APIs item reads deprecated public-API
// calls out of ClickHouse's system.query_log, which only real HTTP traffic can
// produce — call a deprecated endpoint against the local stack to see it.
// ---------------------------------------------------------------------------

type IngestionProfile = {
  key: string;
  sdkName: string;
  sdkVersion: string;
  /** events.source: 'otel-dual-write' is the delayed OTel ingestion path. */
  source: string;
  traceName: string;
};

// Majors below LANGFUSE_SDK_LATEST_MAJOR (python 4, javascript 5) classify as
// outdated_major, which is what makes the SDK item an actionable "upgrade
// required" rather than the softer "upgrade recommended" minor bump.
const PROFILES: IngestionProfile[] = [
  {
    key: "python-legacy",
    sdkName: "python",
    sdkVersion: "3.12.4",
    source: "API",
    traceName: "legacy-python-rag",
  },
  {
    key: "javascript-legacy",
    sdkName: "@langfuse/tracing",
    sdkVersion: "4.9.2",
    source: "API",
    traceName: "legacy-js-agent",
  },
  // Control row: a current SDK on the same project. The SDK section lists
  // every recognized series once it renders, so this proves the panel
  // separates compatible traffic from the offenders instead of hiding it.
  {
    key: "python-current",
    sdkName: "python",
    sdkVersion: "4.7.1",
    source: "API",
    traceName: "current-python-rag",
  },
  // Unrecognized SDK name + OTel dual-write source: an OTLP exporter still on
  // the delayed ingestion path, missing the x-langfuse-ingestion-version
  // header.
  {
    key: "otel-delayed",
    sdkName: "opentelemetry-python",
    sdkVersion: "1.29.0",
    source: "otel-dual-write",
    traceName: "otel-exporter-checkout",
  },
  // No SDK attribution and a non-OTel source: custom instrumentation posting
  // straight to the ingestion API (or an SDK too old to send the headers).
  // ClickHouse maps the empty name to 'unknown', which is what the panel's
  // custom-instrumentation bucket keys off.
  {
    key: "custom-instrumentation",
    sdkName: "",
    sdkVersion: "",
    source: "API",
    traceName: "custom-ingestion-batch",
  },
];

const EVAL_TEMPLATE_NAME = "seed-v4-migration-faithfulness";
const EVAL_SCORE_NAME = "faithfulness";

/**
 * An ACTIVE, NEW-scoped evaluator whose variables read trace input/output —
 * exactly the shape v4 no longer populates, and therefore the one the panel
 * asks the user to repoint at an observation.
 */
const seedDeprecatedEvaluator = async (ctx: ScenarioContext) => {
  const templateId = `${ctx.idPrefix}-eval-template`;
  const configId = `${ctx.idPrefix}-eval-config`;

  await prisma.evalTemplate.upsert({
    where: { id: templateId },
    create: {
      id: templateId,
      projectId: ctx.projectId,
      name: EVAL_TEMPLATE_NAME,
      version: 1,
      prompt:
        "Given the context {{context}}, is the answer {{answer}} faithful? Reply with a score between 0 and 1.",
      // Model/provider are metadata only here: the scenario never executes the
      // evaluator, so no provider key is required (or wanted) locally.
      provider: "openai",
      model: "gpt-4o-mini",
      modelParams: { temperature: 0 },
      vars: ["context", "answer"],
      outputDefinition: { score: "A score between 0 and 1", reasoning: "Why" },
    },
    update: {},
  });

  await prisma.jobConfiguration.upsert({
    where: { id: configId },
    create: {
      id: configId,
      projectId: ctx.projectId,
      jobType: "EVAL",
      status: "ACTIVE",
      evalTemplateId: templateId,
      scoreName: EVAL_SCORE_NAME,
      filter: [],
      // "trace" is the deprecated target; the panel counts these.
      targetObject: "trace",
      variableMapping: [
        {
          templateVariable: "context",
          langfuseObject: "trace",
          selectedColumnId: "input",
          objectName: null,
          jsonSelector: null,
        },
        {
          templateVariable: "answer",
          langfuseObject: "trace",
          selectedColumnId: "output",
          objectName: null,
          jsonSelector: null,
        },
      ],
      sampling: 1,
      delay: 10_000,
      timeScope: ["NEW"],
    },
    update: { status: "ACTIVE", targetObject: "trace", timeScope: ["NEW"] },
  });
};

/**
 * An enabled blob-storage export still reading the legacy
 * traces/observations source. nextSyncAt is parked far in the future so the
 * worker's export job never picks this fixture up and fails against the
 * placeholder bucket.
 */
const seedLegacyIntegration = async (ctx: ScenarioContext) => {
  const farFuture = new Date("2999-01-01T00:00:00.000Z");

  await prisma.blobStorageIntegration.upsert({
    where: { projectId: ctx.projectId },
    create: {
      projectId: ctx.projectId,
      type: "S3_COMPATIBLE",
      bucketName: "seed-langfuse-exports",
      prefix: "v4-migration-seed/",
      accessKeyId: "seed-access-key",
      secretAccessKey: "seed-secret-key",
      region: "auto",
      endpoint: "http://localhost:9090",
      forcePathStyle: true,
      enabled: true,
      exportFrequency: "daily",
      exportSource: "TRACES_OBSERVATIONS",
      nextSyncAt: farFuture,
    },
    update: {
      enabled: true,
      exportSource: "TRACES_OBSERVATIONS",
      nextSyncAt: farFuture,
    },
  });
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const tracesPerProfile = Math.max(
    1,
    Number(params["traces-per-profile"] ?? 3),
  );
  const withV4 = params.v4 !== false;
  const traceCount = tracesPerProfile * PROFILES.length;

  // Anchored on today's UTC midnight, not the wall clock: these timestamps
  // land in ClickHouse ORDER BY keys and re-runs must overwrite in place.
  // The window sits inside the panel's detection lookback.
  const windowMs = 6 * 60 * 60 * 1000;
  const endMs = utcDayStartMs();
  const startMs = endMs - windowMs;
  const stepMs = windowMs / traceCount;
  const firstTraceTimestamp = startMs + jitter(ctx.seed, 0, 1000);

  if (ctx.dryRun) {
    return {
      scenario: "v4-migration",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [`${ctx.idPrefix}-t0`],
      sessionIds: [],
      counts: {
        traces: traceCount,
        observations: traceCount,
        events: withV4 ? traceCount * 2 : 0,
        evaluators: 1,
        integrations: 1,
      },
      verified: {},
      links: [tracesListLink(ctx), migrationStatusLink(ctx)],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const events: EventRecordInsertType[] = [];

  for (let index = 0; index < traceCount; index++) {
    const profile = PROFILES[index % PROFILES.length]!;
    const ingestionAttribution = {
      ingestion_api_key: `pk-lf-seed-${ctx.idPrefix}-${profile.key}`,
      ingestion_sdk_name: profile.sdkName,
      ingestion_sdk_version: profile.sdkVersion,
    };
    const traceId = `${ctx.idPrefix}-t${index}`;
    const timestamp =
      startMs + Math.floor(index * stepMs) + jitter(ctx.seed, index, 1000);

    const trace = createTrace({
      id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      session_id: null,
      timestamp,
      name: profile.traceName,
      user_id: `user-${ctx.idPrefix}-${index % 4}`,
      tags: ["seed", "v4-migration", profile.key],
      public: false,
      bookmarked: false,
      metadata: { scenario: "v4-migration", profile: profile.key },
      input: JSON.stringify({ question: "How do I upgrade to Langfuse v4?" }),
      output: "Follow the action items in the upgrade panel.",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    traces.push(trace);

    const observation = createObservation({
      id: `${traceId}-o0`,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: "GENERATION",
      parent_observation_id: null,
      name: "answer-generation",
      start_time: timestamp,
      end_time: timestamp + 400 + jitter(ctx.seed, index, 2000),
      completion_start_time: timestamp + 120,
      level: "DEFAULT",
      status_message: null,
      input: JSON.stringify({ prompt: "Answer the question." }),
      output: "Follow the action items in the upgrade panel.",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    observations.push(observation);

    if (withV4) {
      events.push({
        ...traceToEvent(trace),
        ...ingestionAttribution,
        source: profile.source,
      });
      events.push({
        ...observationToEvent(observation, trace),
        ...ingestionAttribution,
        source: profile.source,
      });
    }
  }

  ctx.log(
    `writing ${traces.length} traces, ${observations.length} observations${withV4 ? `, ${events.length} events` : ""}, 1 deprecated evaluator, 1 legacy export`,
  );
  for (const batch of chunk(traces, 1000)) {
    await createTracesCh(batch);
  }
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  await seedDeprecatedEvaluator(ctx);
  await seedLegacyIntegration(ctx);

  const traceIds = traces.map((trace) => trace.id);
  // uniqExact(id): count() would see pre-merge ReplacingMergeTree duplicates
  // after re-runs with the same id prefix.
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(id)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(span_id)",
    );
    // events_core is what the migration panel actually reads; it fills from
    // events_full through a materialized view, so a healthy events_full alone
    // does not prove the panel will see anything.
    verified.eventsCore = await countRows(
      "events_core",
      `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(span_id)",
    );
  }

  if (verified.traces < traces.length) {
    throw new SeedError(
      `Readback mismatch: expected ${traces.length} traces, found ${verified.traces}`,
    );
  }
  if (withV4 && verified.events < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_full rows, found ${verified.events}`,
    );
  }
  if (withV4 && verified.eventsCore < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_core rows, found ${verified.eventsCore}`,
      "events_core fills from events_full via events_core_mv — check that the materialized view exists (pnpm run seed -- doctor).",
    );
  }

  return {
    scenario: "v4-migration",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: traceIds.slice(0, 5),
    sessionIds: [],
    counts: {
      traces: traces.length,
      observations: observations.length,
      events: events.length,
      evaluators: 1,
      integrations: 1,
    },
    verified,
    links: [
      tracesListLink(ctx),
      migrationStatusLink(ctx),
      traceLink(ctx, traces[0]!.id, firstTraceTimestamp),
    ],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

const migrationStatusLink = (ctx: ScenarioContext): string =>
  `${ctx.baseUrl}/project/${ctx.projectId}/settings`;

export const v4MigrationScenario: ScenarioDefinition = {
  name: "v4-migration",
  description:
    "A project in the v4 upgrade panel's 'action needed' state: ingestion from SDK majors below the current one (Update SDK), an OTLP exporter still on the delayed dual-write path (Update OTel Instrumentation), unattributed ingestion-API traffic (Upgrade Instrumentation), an ACTIVE trace-target evaluator (Update Evals), and an enabled blob-storage export on the legacy source (Migrate Integrations). The Migrate APIs item is not covered: it reads system.query_log, which only real deprecated HTTP calls fill.",
  supportsV4: true,
  flags: [
    {
      flag: "traces-per-profile",
      type: "number",
      default: 3,
      description: "traces per ingestion profile (5 profiles)",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "mirror into v4 events tables (on by default: the panel reads events_core)",
    },
  ],
  run,
};
