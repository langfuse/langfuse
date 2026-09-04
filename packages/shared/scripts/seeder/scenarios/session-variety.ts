import { prisma } from "../../../src/db";
import {
  createTrace,
  createObservation,
  createSessionScore,
  createTracesCh,
  createObservationsCh,
  createScoresCh,
  createEventsCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { generationUsageCost } from "./payload";
import { jitter, Rng, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, sessionLink } from "./verify";

/**
 * Sessions LIST fixtures: many sessions spread across every axis the sessions
 * table can filter on. The other session scenarios (long-session,
 * session-shapes) build one or four sessions to exercise the session DETAIL
 * view; this one exists so the table's filters — and the sessions search bar —
 * have something to narrow.
 */

/** Session id topics, so a bare-word id search matches a meaningful subset. */
const TOPICS = [
  "checkout",
  "refund",
  "onboarding",
  "support",
  "billing-dispute",
  "password-reset",
];

const TAG_POOL = [
  "billing",
  "urgent",
  "refund",
  "vip",
  "beta",
  "escalated",
  "self-serve",
];

const TRACE_NAMES = [
  "answer-support-question",
  "classify-intent",
  "draft-reply",
  "lookup-order",
  "escalate-to-human",
];

const TIERS = ["enterprise", "pro", "free"];
const REGIONS = ["eu", "us", "apac"];
const CHANNELS = ["web", "mobile", "api"];

const SENTIMENTS = ["positive", "neutral", "negative"];

const COMMENT_TEXTS = [
  "Customer was upset about the duplicate charge, refunded manually.",
  "Model hallucinated the order id here — worth a look.",
  "Great answer, using this as a golden example.",
  "Escalated to billing, still waiting on a reply.",
  "This is the bug we saw last week, reproduced.",
];

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const sessionCount = params["sessions"] as number;
  const days = params["days"] as number;
  const withV4 = params["v4"] as boolean;

  if (sessionCount < 1) {
    throw new SeedError(
      `--sessions must be >= 1, got ${sessionCount}`,
      "pass a positive integer, e.g. --sessions 60",
    );
  }
  if (days < 1) {
    throw new SeedError(
      `--days must be >= 1, got ${days}`,
      "negative windows would place sessions in the future, hidden by UI time filters",
    );
  }

  // The base environment stays in the pool so --environment still shows up in
  // the data; the rest give the environment facet something to filter.
  const environments = Array.from(
    new Set([ctx.environment, "production", "staging", "dev"]),
  );

  const sessionIds = Array.from(
    { length: sessionCount },
    (_, s) =>
      `${ctx.idPrefix}-${TOPICS[s % TOPICS.length]}-${String(s).padStart(4, "0")}`,
  );

  if (ctx.dryRun) {
    return {
      scenario: "session-variety",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [],
      sessionIds: sessionIds.slice(0, 5),
      counts: { sessions: sessionCount },
      verified: {},
      links: [`${ctx.baseUrl}/project/${ctx.projectId}/sessions`],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const rng = new Rng(ctx.seed);
  const windowEnd = utcDayStartMs();
  const windowMs = days * 24 * 60 * 60 * 1000;

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const scores: ScoreRecordInsertType[] = [];
  const events: EventRecordInsertType[] = [];
  const pgSessions: {
    id: string;
    environment: string;
    createdAt: Date;
  }[] = [];
  const comments: {
    projectId: string;
    objectId: string;
    content: string;
  }[] = [];

  for (let s = 0; s < sessionCount; s++) {
    const sessionId = sessionIds[s];
    const environment = environments[s % environments.length];

    // jitter() not rng for anything landing in a ClickHouse ORDER BY key:
    // stream-position randomness re-keys rows when an unrelated flag changes
    // how much rng earlier code consumed.
    const sessionStart =
      windowEnd - windowMs + jitter(ctx.seed, s * 7 + 1, windowMs);

    // Durations span seconds to ~1h so numeric range filters have spread.
    const durationMs =
      s % 9 === 0
        ? 4_000 + jitter(ctx.seed, s * 13, 6_000)
        : 30_000 + jitter(ctx.seed, s * 13, 3_500_000);
    const traceCount = 1 + (jitter(ctx.seed, s * 17 + 3, 12) as number);
    const stepMs = traceCount > 1 ? durationMs / (traceCount - 1) : 0;

    // 1–3 users per session, so `any of` and `all of` on userIds both bite.
    const userCount = 1 + (jitter(ctx.seed, s * 19 + 5, 3) as number);
    const sessionUsers = Array.from(
      { length: userCount },
      (_, u) => `user-${TIERS[(s + u) % TIERS.length]}-${(s * 3 + u) % 24}`,
    );

    // 1–3 tags, drawn deterministically so the same session keeps its tags.
    const tagCount = 1 + (jitter(ctx.seed, s * 23 + 7, 3) as number);
    const sessionTags = Array.from(
      { length: tagCount },
      (_, i) => TAG_POOL[(s * 2 + i * 3) % TAG_POOL.length],
    );

    // v4 session metadata is argMax over (start_time, event_ts, span_id) — the
    // LAST event of the session wins — so the same map goes on every row.
    const sessionMetadata = {
      tier: TIERS[s % TIERS.length],
      region: REGIONS[s % REGIONS.length],
      channel: CHANNELS[s % CHANNELS.length],
      topic: TOPICS[s % TOPICS.length],
    };

    pgSessions.push({
      id: sessionId,
      environment,
      createdAt: new Date(sessionStart),
    });

    for (let t = 0; t < traceCount; t++) {
      const traceId = `${sessionId}-t${t}`;
      const timestamp =
        sessionStart +
        Math.floor(t * stepMs) +
        jitter(ctx.seed, s * 31 + t, 400);

      traces.push(
        createTrace({
          id: traceId,
          project_id: ctx.projectId,
          environment,
          session_id: sessionId,
          timestamp,
          name: TRACE_NAMES[(s + t) % TRACE_NAMES.length],
          // Cycle users across traces so multi-user sessions really have
          // several distinct user_ids aggregated into userIds.
          user_id: sessionUsers[t % sessionUsers.length],
          release: "v1.2.3",
          version: "v1.2.3",
          tags: sessionTags,
          public: false,
          bookmarked: false,
          metadata: sessionMetadata,
          input: JSON.stringify({ topic: sessionMetadata.topic, turn: t }),
          output: JSON.stringify({ ok: true }),
          created_at: Date.now(),
          updated_at: Date.now(),
          event_ts: Date.now(),
        }),
      );

      // Two observations per trace: a root span and one generation carrying the
      // usage/cost that the table's token and cost columns aggregate.
      const rootStart = timestamp;
      const genStart = timestamp + 120 + jitter(ctx.seed, s * 37 + t, 200);
      const genEnd = genStart + 400 + jitter(ctx.seed, s * 41 + t, 2_500);

      observations.push(
        createObservation({
          id: `${traceId}-o0`,
          trace_id: traceId,
          project_id: ctx.projectId,
          environment,
          type: "AGENT",
          parent_observation_id: null,
          name: "session-turn",
          start_time: rootStart,
          end_time: genEnd + 20,
          completion_start_time: null,
          level: "DEFAULT",
          status_message: null,
          version: null,
          input: null,
          output: null,
          metadata: sessionMetadata,
          provided_model_name: null,
          internal_model_id: null,
          model_parameters: "{}",
          provided_usage_details: {},
          usage_details: {},
          provided_cost_details: {},
          cost_details: {},
          total_cost: null,
          prompt_id: null,
          prompt_name: null,
          prompt_version: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          event_ts: Date.now(),
        }),
      );

      // Token counts scale with the session index so cost/token filters have a
      // wide, predictable spread rather than one clump.
      const usageInput = 150 + (jitter(ctx.seed, s * 43 + t, 6_000) as number);
      const usageOutput = 60 + (jitter(ctx.seed, s * 47 + t, 2_500) as number);

      observations.push(
        createObservation({
          id: `${traceId}-o1`,
          trace_id: traceId,
          project_id: ctx.projectId,
          environment,
          type: "GENERATION",
          parent_observation_id: `${traceId}-o0`,
          name: "gpt-5.4-completion",
          start_time: genStart,
          end_time: genEnd,
          completion_start_time: genStart + 90,
          level: "DEFAULT",
          status_message: null,
          version: null,
          input: JSON.stringify({
            messages: [{ role: "user", content: sessionMetadata.topic }],
          }),
          output: "Here is what I found.",
          metadata: sessionMetadata,
          provided_model_name: "gpt-5.4",
          internal_model_id: null,
          model_parameters: JSON.stringify({ temperature: 0.7 }),
          ...generationUsageCost(usageInput, usageOutput),
          prompt_id: null,
          prompt_name: null,
          prompt_version: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          event_ts: Date.now(),
        }),
      );
    }

    // Session-level scores: one numeric, plus a categorical and a boolean on a
    // subset, so `scores.<name>` covers all three lowering shapes.
    scores.push(
      createSessionScore({
        id: `${sessionId}-score-quality`,
        project_id: ctx.projectId,
        session_id: sessionId,
        environment,
        name: "session-quality",
        value: Math.round(rng.next() * 100) / 100,
        data_type: "NUMERIC",
        source: "API",
        comment: null,
        metadata: {},
        timestamp: sessionStart,
      }),
    );
    if (s % 2 === 0) {
      scores.push(
        createSessionScore({
          id: `${sessionId}-score-sentiment`,
          project_id: ctx.projectId,
          session_id: sessionId,
          environment,
          name: "sentiment",
          value: 1,
          string_value: SENTIMENTS[s % SENTIMENTS.length],
          data_type: "CATEGORICAL",
          source: "API",
          comment: null,
          metadata: {},
          timestamp: sessionStart,
        }),
      );
    }
    if (s % 3 === 0) {
      scores.push(
        createSessionScore({
          id: `${sessionId}-score-resolved`,
          project_id: ctx.projectId,
          session_id: sessionId,
          environment,
          name: "resolved",
          value: s % 6 === 0 ? 1 : 0,
          // `score_booleans` is concat(name, ':', lowerUTF8(string_value)), so a
          // boolean score without the True/False string can never be filtered.
          string_value: s % 6 === 0 ? "True" : "False",
          data_type: "BOOLEAN",
          source: "API",
          comment: null,
          metadata: {},
          timestamp: sessionStart,
        }),
      );
    }

    // Comments on every 4th session, so commentCount and commentContent are
    // both non-empty without every row having one.
    if (s % 4 === 0) {
      comments.push({
        projectId: ctx.projectId,
        objectId: sessionId,
        content: COMMENT_TEXTS[s % COMMENT_TEXTS.length],
      });
    }
  }

  if (withV4) {
    const tracesById = new Map(traces.map((tr) => [tr.id, tr]));
    for (const trace of traces) events.push(traceToEvent(trace));
    for (const obs of observations) {
      const trace = obs.trace_id ? tracesById.get(obs.trace_id) : undefined;
      if (trace) events.push(observationToEvent(obs, trace));
    }
  }

  const counts: Record<string, number> = {
    sessions: sessionIds.length,
    traces: traces.length,
    observations: observations.length,
    scores: scores.length,
    comments: comments.length,
    events: events.length,
  };

  ctx.log(
    `writing ${sessionIds.length} sessions, ${traces.length} traces, ${observations.length} observations, ${scores.length} scores, ${comments.length} comments${withV4 ? `, ${events.length} events` : ""}`,
  );

  // Session detail 404s without the Postgres trace_sessions row.
  for (const batch of chunk(pgSessions, 200)) {
    await prisma.$transaction(
      batch.map((session) =>
        prisma.traceSession.upsert({
          where: {
            id_projectId: { id: session.id, projectId: ctx.projectId },
          },
          update: {},
          create: {
            id: session.id,
            projectId: ctx.projectId,
            environment: session.environment,
            createdAt: session.createdAt,
          },
        }),
      ),
    );
  }

  // Re-runs with the same id prefix would otherwise stack duplicate comments;
  // ClickHouse rows dedupe by id, Postgres comments do not.
  await prisma.comment.deleteMany({
    where: {
      projectId: ctx.projectId,
      objectType: "SESSION",
      objectId: { in: comments.map((comment) => comment.objectId) },
    },
  });
  if (comments.length > 0) {
    await prisma.comment.createMany({
      data: comments.map((comment) => ({
        projectId: comment.projectId,
        objectType: "SESSION" as const,
        objectId: comment.objectId,
        content: comment.content,
      })),
    });
  }

  for (const batch of chunk(traces, 1000)) await createTracesCh(batch);
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  for (const batch of chunk(scores, 1000)) await createScoresCh(batch);
  for (const batch of chunk(events, 500)) await createEventsCh(batch);

  // uniqExact(id): count() would see pre-merge ReplacingMergeTree duplicates
  // after re-runs with the same id prefix.
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND session_id IN {sessionIds: Array(String)}`,
      { projectId: ctx.projectId, sessionIds },
      "uniqExact(id)",
    ),
    sessions: await countRows(
      "traces",
      `project_id = {projectId: String} AND session_id IN {sessionIds: Array(String)}`,
      { projectId: ctx.projectId, sessionIds },
      "uniqExact(session_id)",
    ),
    scores: await countRows(
      "scores",
      `project_id = {projectId: String} AND session_id IN {sessionIds: Array(String)}`,
      { projectId: ctx.projectId, sessionIds },
      "uniqExact(id)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      `project_id = {projectId: String} AND session_id IN {sessionIds: Array(String)}`,
      { projectId: ctx.projectId, sessionIds },
      "uniqExact(span_id)",
    );
  }

  if (verified.sessions < sessionIds.length) {
    throw new SeedError(
      `Readback mismatch: expected ${sessionIds.length} sessions, found ${verified.sessions}`,
    );
  }
  if (verified.traces < traces.length) {
    throw new SeedError(
      `Readback mismatch: expected ${traces.length} traces, found ${verified.traces}`,
    );
  }
  if (verified.scores < scores.length) {
    throw new SeedError(
      `Readback mismatch: expected ${scores.length} scores, found ${verified.scores}`,
    );
  }
  if (withV4 && verified.events < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "session-variety",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: traces.slice(0, 5).map((trace) => trace.id),
    sessionIds,
    counts,
    verified,
    links: [
      `${ctx.baseUrl}/project/${ctx.projectId}/sessions`,
      sessionLink(ctx, sessionIds[0]),
    ],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const sessionVarietyScenario: ScenarioDefinition = {
  name: "session-variety",
  description:
    "Many sessions spread across every axis the sessions TABLE filters on — searchable topic ids, 1-3 userIds and 1-3 tags per session, four environments, session metadata (tier/region/channel/topic), numeric + categorical + boolean session scores, comments on a quarter of them, and durations/trace counts/costs/tokens with real spread. The other session scenarios build one or four sessions for the DETAIL view; this one gives the list and its filters something to narrow.",
  flags: [
    {
      flag: "sessions",
      type: "number",
      default: 60,
      description: "number of sessions to write",
    },
    {
      flag: "days",
      type: "number",
      default: 7,
      description: "spread the sessions over this many days back from today",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "mirror into v4 events tables (on by default: the sessions bar is v4-only)",
    },
  ],
  supportsV4: true,
  run,
};
