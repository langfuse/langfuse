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
import { ObservationType } from "../../../src/domain/observations";
import { observationToEvent } from "./event-mirror";
import { generationUsageCost } from "./payload";
import { jitter, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, escapeLike, traceLink, tracesListLink } from "./verify";

const ACTIONS = [
  "answer",
  "classify",
  "summarize",
  "route",
  "triage",
  "resolve",
  "draft",
  "translate",
  "review",
  "verify",
  "retrieve",
  "reconcile",
  "escalate",
  "prioritize",
  "explain",
  "compare",
  "search",
  "validate",
  "recommend",
  "follow-up",
];
const TOPICS = [
  "billing",
  "shipping",
  "account-access",
  "subscriptions",
  "refunds",
  "product-search",
  "order-status",
  "appointments",
  "knowledge-base",
  "payment-methods",
  "returns",
  "onboarding",
];
const NAMES = ACTIONS.flatMap((action) =>
  TOPICS.map((topic) => `${action}-${topic}-request`),
);
const ROOT_TYPES: ObservationType[] = ["AGENT", "CHAIN", "GENERATION", "SPAN"];
const CHILD_TYPES: ObservationType[] = [
  "TOOL",
  "RETRIEVER",
  "EMBEDDING",
  "EVALUATOR",
  "GUARDRAIL",
  "CHAIN",
  "SPAN",
  "EVENT",
  "AGENT",
];
const MODELS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "claude-haiku-4-5",
  "gemini-3.5-flash-lite",
];
const TAGS = [
  "billing",
  "urgent",
  "refund",
  "vip",
  "beta",
  "escalated",
  "self-serve",
  "knowledge",
];
const TIERS = ["enterprise", "pro", "free"];
const REGIONS = ["eu", "us", "apac"];
const CHANNELS = ["web", "mobile", "api"];
const LANGUAGES = ["English", "German", "French", "Japanese"];
const USERS = [
  "alex",
  "sam",
  "jordan",
  "taylor",
  "morgan",
  "casey",
  "jamie",
  "riley",
];

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const traceCount = params["traces"] as number;
  const nameCount = params["names"] as number;
  const withV4 = params["v4"] as boolean;
  if (
    !Number.isInteger(nameCount) ||
    !Number.isInteger(traceCount) ||
    nameCount < 1 ||
    nameCount > NAMES.length ||
    traceCount < nameCount
  ) {
    throw new SeedError(
      `--names must be an integer from 1–${NAMES.length}, and --traces an integer at least --names`,
      "try --traces 1200 --names 240 --v4",
    );
  }

  const sessionCount = Math.ceil(traceCount / 10);
  const sessionIds = Array.from(
    { length: sessionCount },
    (_, index) => `${ctx.idPrefix}-session-${index}`,
  );
  const traceIds = Array.from(
    { length: Math.min(traceCount, 5) },
    (_, index) => `${ctx.idPrefix}-trace-${index}`,
  );
  const counts: Record<string, number> = {
    traces: traceCount,
    observations: traceCount * 3,
    events: withV4 ? traceCount * 3 : 0,
    sessions: sessionCount,
    rootNames: nameCount,
  };
  const links = [
    tracesListLink(ctx),
    `${ctx.baseUrl}/project/${ctx.projectId}/observations`,
    `${ctx.baseUrl}/project/${ctx.projectId}/sessions`,
  ];
  if (ctx.dryRun) {
    return {
      scenario: "filter-variety",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds,
      sessionIds: sessionIds.slice(0, 5),
      counts,
      verified: {},
      links,
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const environments = Array.from(
    new Set([
      ctx.environment,
      "default",
      "production",
      "staging",
      "evaluation",
    ]),
  );
  const prompts = await prisma.prompt.findMany({
    where: { projectId: ctx.projectId },
    select: { id: true, name: true, version: true },
    distinct: ["name"],
    orderBy: [{ name: "asc" }, { version: "desc" }],
    take: 20,
  });
  await prisma.traceSession.createMany({
    data: sessionIds.map((id, index) => ({
      id,
      projectId: ctx.projectId,
      environment: environments[index % environments.length],
    })),
    skipDuplicates: true,
  });

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const events: EventRecordInsertType[] = [];
  const dayStart = utcDayStartMs();
  const eventTs = Date.now();
  for (let index = 0; index < traceCount; index++) {
    // Guarantee every requested name, then favor common workflows while
    // retaining a long tail of rarer names with different facet counts.
    const nameIndex =
      index < nameCount
        ? index
        : jitter(
            ctx.seed,
            index * 13,
            (index % 5 === 0 ? nameCount : Math.min(nameCount, 24)) - 1,
          );
    const topic = TOPICS[nameIndex % TOPICS.length];
    const sessionIndex = Math.floor(index / 10);
    const environment = environments[sessionIndex % environments.length];
    const start = dayStart + jitter(ctx.seed, index * 17, 15_000);
    const duration = 250 + jitter(ctx.seed, index * 19, 30_000);
    let level: "DEFAULT" | "ERROR" | "WARNING" | "DEBUG" = "DEFAULT";
    if (index % 19 === 3) level = "ERROR";
    else if (index % 11 === 4) level = "WARNING";
    else if (index % 17 === 0) level = "DEBUG";
    const metadata = {
      scenario: "filter-variety",
      topic,
      tier: TIERS[index % TIERS.length],
      region: REGIONS[Math.floor(index / 3) % REGIONS.length],
      channel: CHANNELS[Math.floor(index / 7) % CHANNELS.length],
      language: LANGUAGES[index % LANGUAGES.length],
    };
    const trace = createTrace({
      id: `${ctx.idPrefix}-trace-${index}`,
      project_id: ctx.projectId,
      name: NAMES[nameIndex],
      environment,
      timestamp: start,
      session_id: sessionIds[sessionIndex],
      user_id:
        index % 19 === 0
          ? null
          : `${USERS[index % USERS.length]}-${TIERS[Math.floor(index / 8) % TIERS.length]}`,
      release: `v1.${index % 4}.0`,
      version: `workflow-v${1 + (index % 3)}`,
      tags: Array.from(
        new Set([
          "filter-variety",
          TAGS[index % TAGS.length],
          TAGS[Math.floor(index / 5) % TAGS.length],
        ]),
      ),
      metadata,
      public: false,
      bookmarked: index % 29 === 0,
      input: JSON.stringify({
        request: `Please help with ${topic}.`,
        channel: metadata.channel,
      }),
      output: JSON.stringify({
        resolution: `Reviewed the ${topic} request.`,
        status: level === "ERROR" ? "needs-retry" : "resolved",
      }),
      created_at: eventTs,
      updated_at: eventTs,
      event_ts: eventTs,
    });
    traces.push(trace);
    const rootId = `${ctx.idPrefix}-obs-${index}-root`;
    const types: ObservationType[] = [
      ROOT_TYPES[index % ROOT_TYPES.length],
      "GENERATION",
      CHILD_TYPES[index % CHILD_TYPES.length],
    ];
    for (let slot = 0; slot < types.length; slot++) {
      const type = types[slot];
      const generation = type === "GENERATION";
      const prompt =
        generation && prompts.length > 0
          ? prompts[index % prompts.length]
          : undefined;
      const observation = createObservation({
        id: slot === 0 ? rootId : `${ctx.idPrefix}-obs-${index}-${slot}`,
        trace_id: trace.id,
        project_id: ctx.projectId,
        environment,
        type,
        parent_observation_id: slot === 0 ? null : rootId,
        name: slot === 0 ? trace.name : `${type.toLowerCase()}-${topic}`,
        start_time: start + slot * 20,
        end_time: start + duration - slot * 10,
        completion_start_time: generation ? start + 90 : null,
        level,
        status_message:
          level === "ERROR"
            ? "Upstream request timed out; retry scheduled"
            : null,
        version: trace.version,
        metadata,
        input: trace.input,
        output: slot === 2 && index % 7 === 0 ? null : trace.output,
        provided_model_name: generation
          ? MODELS[Math.floor(index / 3) % MODELS.length]
          : null,
        internal_model_id: null,
        model_parameters: generation
          ? JSON.stringify({ temperature: (index % 5) / 10 })
          : "{}",
        ...(generation
          ? generationUsageCost(
              100 + jitter(ctx.seed, index * 23 + slot, 8000),
              30 + jitter(ctx.seed, index * 29 + slot, 2000),
            )
          : {
              provided_usage_details: {},
              usage_details: {},
              provided_cost_details: {},
              cost_details: {},
              total_cost: null,
            }),
        prompt_id: prompt?.id ?? null,
        prompt_name: prompt?.name ?? null,
        prompt_version: prompt?.version ?? null,
        created_at: eventTs,
        updated_at: eventTs,
        event_ts: eventTs,
      });
      observations.push(observation);
      if (withV4) {
        // Native v4 traces have a real root observation with an empty parent.
        events.push({
          ...observationToEvent(observation, trace),
          parent_span_id: observation.parent_observation_id ?? "",
        });
      }
    }
  }

  ctx.log(
    `writing ${traces.length} traces, ${observations.length} observations, ${nameCount} root names, ${events.length} events`,
  );
  for (const batch of chunk(traces, 1000)) await createTracesCh(batch);
  for (const batch of chunk(observations, 1000))
    await createObservationsCh(batch);
  for (const batch of chunk(events, 1000)) await createEventsCh(batch);
  const where =
    "project_id = {projectId: String} AND trace_id LIKE {prefix: String}";
  const queryParams = {
    projectId: ctx.projectId,
    prefix: `${escapeLike(ctx.idPrefix)}-trace-%`,
  };
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      "project_id = {projectId: String} AND id LIKE {prefix: String}",
      queryParams,
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      where,
      queryParams,
      "uniqExact(id)",
    ),
    rootNames: await countRows(
      "traces",
      "project_id = {projectId: String} AND id LIKE {prefix: String}",
      queryParams,
      "uniqExact(name)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      where,
      queryParams,
      "uniqExact(span_id)",
    );
    verified.rootEvents = await countRows(
      "events_full",
      where,
      queryParams,
      "uniqExactIf(span_id, parent_span_id = '')",
    );
    verified.rootNames = await countRows(
      "events_full",
      where,
      queryParams,
      "uniqExactIf(name, parent_span_id = '')",
    );
    verified.types = await countRows(
      "events_full",
      where,
      queryParams,
      "uniqExact(type)",
    );
    verified.environments = await countRows(
      "events_full",
      where,
      queryParams,
      "uniqExact(environment)",
    );
    verified.rootTypes = await countRows(
      "events_full",
      where,
      queryParams,
      "uniqExactIf(type, parent_span_id = '')",
    );
    verified.rootLevels = await countRows(
      "events_full",
      where,
      queryParams,
      "uniqExactIf(level, parent_span_id = '')",
    );
    verified.models = await countRows(
      "events_full",
      where + " AND provided_model_name != ''",
      queryParams,
      "uniqExact(provided_model_name)",
    );
    verified.promptNames = await countRows(
      "events_full",
      where + " AND prompt_name != ''",
      queryParams,
      "uniqExact(prompt_name)",
    );
    verified.users = await countRows(
      "events_full",
      where + " AND user_id != ''",
      queryParams,
      "uniqExact(user_id)",
    );
    verified.sessions = await countRows(
      "events_full",
      where,
      queryParams,
      "uniqExact(session_id)",
    );
  }
  for (const key of [
    "traces",
    "observations",
    "rootNames",
    ...(withV4 ? ["events"] : []),
  ]) {
    if (verified[key] < counts[key])
      throw new SeedError(
        `Readback mismatch: expected ${counts[key]} ${key}, found ${verified[key]}`,
      );
  }
  if (withV4 && verified.rootEvents < traceCount)
    throw new SeedError(
      `Readback mismatch: expected ${traceCount} root events, found ${verified.rootEvents}`,
    );
  if (verified.rootNames !== nameCount)
    throw new SeedError(
      `Readback mismatch: expected ${nameCount} distinct root names, found ${verified.rootNames}`,
      "use a fresh --id-prefix when changing --traces or --names",
    );
  return {
    scenario: "filter-variety",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds,
    sessionIds: sessionIds.slice(0, 5),
    counts,
    verified,
    links: [
      ...links,
      traceLink(ctx, traceIds[0], dayStart + jitter(ctx.seed, 0, 15_000)),
    ],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const filterVarietyScenario: ScenarioDefinition = {
  name: "filter-variety",
  description:
    "Readable root trace names with common and rare workflows, native v4 roots and children, ten observation types, environments, tags, levels, models, users, sessions, and metadata for filter/search testing.",
  supportsV4: true,
  flags: [
    {
      flag: "traces",
      type: "number",
      default: 1200,
      description: "traces, each with a root and two child observations",
    },
    {
      flag: "names",
      type: "number",
      default: 240,
      description:
        "distinct readable root trace names (1–240; traces must be at least names)",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "write native root and child events for the v4 tracing tables",
    },
  ],
  run,
};
