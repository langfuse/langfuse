import { prisma } from "../../../src/db";
import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createEventsCh,
} from "../../../src/server";
import {
  createTopicRun,
  ensureDefaultTopicFacets,
  listTopicRules,
  saveTopicRule,
  saveTopicRun,
  writeTopicAssignments,
  writeTopicSummaries,
} from "../../../src/server/topics";
import type {
  TopicAssignment,
  TopicDefinition,
  TopicSummary,
} from "../../../src/topics";
import type { FilterState } from "../../../src/types";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, Rng, utcDayStartMs } from "./rng";
import { ScenarioDefinition, SeedError } from "./types";
import { countRows } from "./verify";

type SeedTopic = { name: string; description: string; count: number };

// Sizes span two orders of magnitude so treemap tiles, grid cells and map
// clusters range from dominant to a single trace; some names are long enough
// to wrap or truncate at every width.
const INTENT_TOPICS: SeedTopic[] = [
  {
    name: "Billing and subscription questions",
    description: "Invoices, refunds, duplicate charges and plan changes.",
    count: 34,
  },
  {
    name: "Debugging API errors in production",
    description: "Stack traces, undefined properties and failing handlers.",
    count: 22,
  },
  {
    name: "Travel planning around bad weather",
    description: "Itineraries, packing lists and indoor alternatives.",
    count: 15,
  },
  {
    name: "Exporting traces and datasets to a data warehouse",
    description: "Blob storage exports, schedules and schema questions.",
    count: 11,
  },
  {
    name: "Recovering access after changing a company email address on a shared workspace",
    description: "Sign-in, account recovery and workspace ownership.",
    count: 8,
  },
  {
    name: "Prompt versioning",
    description: "Labels, rollbacks and comparing prompt versions.",
    count: 6,
  },
  {
    name: "Cost dashboards",
    description: "Token usage, model prices and spend per user.",
    count: 4,
  },
  {
    name: "Single sign-on",
    description: "SAML and OIDC configuration.",
    count: 3,
  },
  {
    name: "Data retention",
    description: "Deleting traces and retention windows.",
    count: 2,
  },
];

const ISSUE_TOPICS: SeedTopic[] = [
  {
    name: "Duplicate charges after renewal",
    description: "A renewal or retry charged the same period twice.",
    count: 20,
  },
  {
    name: "Undefined property crashes in request handlers",
    description: "Handlers dereference fields the request does not contain.",
    count: 14,
  },
  {
    name: "Login loop after SSO migration when the identity provider rotates signing certificates",
    description:
      "Users are redirected back to sign-in after a certificate change.",
    count: 9,
  },
  {
    name: "Stale forecast data",
    description: "Answers relied on an outdated weather forecast.",
    count: 6,
  },
  {
    name: "Missing invoice tax details",
    description: "Invoices without a VAT number or billing address.",
    count: 3,
  },
];

const OUTLIERS = 7;
const AWAITING = 4;
const DIMENSIONS = 16;
const ISSUES_APPLICABLE = 60;
const SECOND_RULE_TRACES = 48;
// Rules are found again by name, so the prefix keeps re-runs off the project's own rules.
const RULE_NAMES = [
  "Seed: all traces",
  "Seed: enterprise workspaces on the annual plan with SSO enabled",
] as const;
const SECOND_RULE_TAGS = ["enterprise", "annual-plan", "sso"];
const SECOND_RULE_FILTER: FilterState = [
  {
    column: "tags",
    type: "arrayOptions",
    operator: "any of",
    value: SECOND_RULE_TAGS,
  },
];
const REQUEST_DETAILS = [
  "The customer asked for step-by-step instructions and a link to the relevant settings page.",
  "They tried the documented approach first and want to know why it did not work for their account.",
  "The user needs an answer today because their team is blocked on it.",
  "They shared a screenshot and asked which option applies to their plan.",
];
const OUTLIER_REQUESTS = [
  "Can you recommend a sourdough recipe for a dense rye loaf?",
  "What is a good name for a new houseplant?",
  "Translate this birthday message into Portuguese.",
  "How do I fold a fitted sheet?",
];

export const topicsMapScenario: ScenarioDefinition = {
  name: "topics-map",
  description:
    "A published Topics map without model calls: 116 traces, two live rules (one with a long name), Intent and Issues maps with nine and five topics of very different sizes, long topic names, outliers and traces awaiting a map. Needs Topics enabled for the project.",
  supportsV4: true,
  flags: [],
  run: async (ctx, params) => {
    const startedAt = Date.now();
    const rng = new Rng(ctx.seed);
    const assignedCount =
      INTENT_TOPICS.reduce((sum, topic) => sum + topic.count, 0) + OUTLIERS;
    const traceCount = assignedCount + AWAITING;
    const dayStart = utcDayStartMs();
    const cohortFrom = dayStart - 2 * 86_400_000;
    const cohortTo = dayStart - 60 * 60 * 1000;
    // Discovery traces spread across the cohort; awaiting ones arrive after it.
    const timestamps = Array.from({ length: traceCount }, (_, index) =>
      index < assignedCount
        ? cohortFrom +
          index * Math.floor((cohortTo - cohortFrom) / assignedCount) +
          jitter(ctx.seed, index, 60_000)
        : cohortTo + (index - assignedCount + 1) * 5 * 60_000,
    );
    const traceIds = timestamps.map(
      (_, index) => `${ctx.idPrefix}-m${index.toString().padStart(3, "0")}`,
    );
    const intentOf = topicIndexes(INTENT_TOPICS, OUTLIERS);
    const counts = {
      traces: traceCount,
      observations: traceCount,
      events: traceCount * 2,
      rules: RULE_NAMES.length,
      maps: 3,
      summaries: traceCount * 2,
      assignments: assignedCount + ISSUES_APPLICABLE + SECOND_RULE_TRACES,
    };
    const summary = {
      scenario: "topics-map",
      target: "clickhouse" as const,
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds,
      sessionIds: [],
      counts,
      links: [`${ctx.baseUrl}/project/${ctx.projectId}/topics`],
      dryRun: ctx.dryRun,
    };
    if (ctx.dryRun) {
      return { ...summary, verified: {}, durationMs: Date.now() - startedAt };
    }

    const requests = traceIds.map((_, index) => {
      // Traces awaiting a map ask familiar questions.
      const topic =
        INTENT_TOPICS[intentOf[index] ?? (index >= assignedCount ? 0 : -1)];
      return topic
        ? `${topic.description} Request ${index + 1}: ${rng.pick(REQUEST_DETAILS)}`
        : `Unrelated request ${index + 1}: ${rng.pick(OUTLIER_REQUESTS)}`;
    });
    const traces = traceIds.map((id, index) =>
      createTrace({
        id,
        project_id: ctx.projectId,
        environment: ctx.environment,
        timestamp: timestamps[index],
        name: "assistant-request",
        session_id: null,
        user_id: `${ctx.idPrefix}-user-${index % 9}`,
        public: false,
        bookmarked: false,
        tags: [
          "seed",
          "topics-map",
          ...(index < SECOND_RULE_TRACES ? SECOND_RULE_TAGS : []),
        ],
        metadata: { scenario: "topics-map" },
        input: JSON.stringify([{ role: "user", content: requests[index] }]),
        output: JSON.stringify([
          {
            role: "assistant",
            content: `Here is how to handle that: ${requests[index]}`,
          },
        ]),
        created_at: timestamps[index],
        updated_at: timestamps[index]! + 1800,
        event_ts: timestamps[index]! + 1800,
      }),
    );
    const generations = traces.map((trace, index) =>
      createObservation({
        id: `${trace.id}-generation`,
        project_id: ctx.projectId,
        trace_id: trace.id,
        environment: ctx.environment,
        parent_observation_id: null,
        type: "GENERATION",
        name: "answer",
        start_time: timestamps[index]! + 50,
        end_time: timestamps[index]! + 1700,
        completion_start_time: timestamps[index]! + 300,
        created_at: timestamps[index],
        updated_at: timestamps[index]! + 1800,
        event_ts: timestamps[index]! + 1800,
        input: trace.input,
        output: trace.output,
        metadata: {},
        status_message: null,
        provided_model_name: null,
        internal_model_id: null,
        model_parameters: "{}",
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        provided_usage_details: {},
        usage_details: {},
        provided_cost_details: {},
        cost_details: {},
        total_cost: 0,
      }),
    );
    ctx.log(`writing ${traceCount} traces with v4 events`);
    await createTracesCh(traces);
    await createObservationsCh(generations);
    await createEventsCh(
      traces.flatMap((trace, index) => [
        { ...traceToEvent(trace), end_time: generations[index]!.updated_at },
        observationToEvent(generations[index]!, trace),
      ]),
    );

    const facets = await ensureDefaultTopicFacets(ctx.projectId);
    const facet = (name: string) => {
      const found = facets.find((item) => item.isBuiltIn && item.name === name);
      if (!found?.versions[0])
        throw new SeedError(`Built-in "${name}" facet not found.`);
      return { id: found.id, version: found.versions[0].version };
    };
    const intent = facet("Intent");
    const issues = facet("Issues");
    const existingRules = await listTopicRules(ctx.projectId);
    const rules = [];
    for (const [index, name] of RULE_NAMES.entries())
      rules.push(
        await saveTopicRule({
          id: existingRules.find((rule) => rule.name === name)?.id,
          projectId: ctx.projectId,
          name,
          filter: index === 0 ? [] : SECOND_RULE_FILTER,
          facetIds: index === 0 ? [intent.id, issues.id] : [intent.id],
        }),
      );

    const processedAt = new Date(dayStart).toISOString();
    const source = (index: number) => ({
      traceId: traceIds[index]!,
      sessionId: null,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceName: "assistant-request",
      unitStartTime: new Date(timestamps[index]!).toISOString(),
    });
    const summaries = (
      facetRef: { id: string; version: number },
      topics: SeedTopic[],
      topicOf: (index: number) => number | undefined,
      applicable: (index: number) => boolean,
    ): TopicSummary[] =>
      traceIds.map((_, index) => {
        const topic = topics[topicOf(index) ?? -1];
        const complete = applicable(index);
        return {
          ...source(index),
          facetId: facetRef.id,
          facetVersion: facetRef.version,
          triggerType: "manual",
          state: complete ? "complete" : "not_applicable",
          summary: complete ? summaryText(topic, requests[index]!) : "",
          embedding: complete
            ? embedding(topicOf(index) ?? topics.length, rng)
            : [],
          transcriptId: traceIds[index]!,
          transcriptVersion: "seed",
          summaryModel: "seed-summary",
          embeddingModel: "seed-embedding",
          providedUsageDetails: {},
          usageDetails: {},
          providedCostDetails: {},
          costDetails: {},
          processedAt,
          metadata: {},
        };
      });
    const issuesOf = topicIndexes(ISSUE_TOPICS, OUTLIERS);
    const intentSummaries = summaries(
      intent,
      INTENT_TOPICS,
      (index) => intentOf[index],
      () => true,
    );
    const issueSummaries = summaries(
      issues,
      ISSUE_TOPICS,
      (index) => issuesOf[index],
      (index) => index < ISSUES_APPLICABLE || index >= assignedCount,
    );
    ctx.log("writing summaries");
    await writeTopicSummaries([...intentSummaries, ...issueSummaries]);

    // Run ids are unique across projects, so the default prefix alone would collide.
    const runPrefix = `${ctx.idPrefix}-${ctx.projectId}`;
    const maps = [
      {
        runId: `${runPrefix}-intent`,
        rule: rules[0]!,
        facet: intent,
        topics: INTENT_TOPICS,
        topicOf: (index: number) => intentOf[index],
        members: (index: number) => index < assignedCount,
        summaries: intentSummaries,
      },
      {
        runId: `${runPrefix}-issues`,
        rule: rules[0]!,
        facet: issues,
        topics: ISSUE_TOPICS,
        topicOf: (index: number) => issuesOf[index],
        members: (index: number) => index < ISSUES_APPLICABLE,
        summaries: issueSummaries,
      },
      {
        runId: `${runPrefix}-enterprise-intent`,
        rule: rules[1]!,
        facet: intent,
        topics: INTENT_TOPICS,
        topicOf: (index: number) => intentOf[index],
        members: (index: number) => index < SECOND_RULE_TRACES,
        summaries: intentSummaries,
      },
    ];
    // Completed runs never change, so a re-run replaces them.
    await prisma.topicClusteringRun.deleteMany({
      where: {
        projectId: ctx.projectId,
        id: { in: maps.map((map) => map.runId) },
      },
    });
    for (const map of maps) {
      const config = {
        timeRange: {
          from: new Date(cohortFrom).toISOString(),
          to: new Date(cohortTo).toISOString(),
        },
        embeddingModel: "seed-embedding",
        dimensions: DIMENSIONS,
      };
      await createTopicRun({
        id: map.runId,
        projectId: ctx.projectId,
        facetId: map.facet.id,
        facetVersion: map.facet.version,
        ruleId: map.rule.id,
        config,
      });
      const definitions: TopicDefinition[] = map.topics.map((topic, k) => ({
        topicVersionId: `${map.runId}-topic-${k}`,
        projectId: ctx.projectId,
        topicId: `${map.runId}-topic-${k}`,
        createdByRunId: map.runId,
        createdAt: processedAt,
        tags: [],
        name: topic.name,
        description: topic.description,
        centroid: unit(k),
        radius: 0.4,
        representativeSummaries: [],
        metadata: {},
      }));
      const assignments: TopicAssignment[] = traceIds.flatMap((_, index) => {
        if (!map.members(index)) return [];
        const k = map.topicOf(index);
        const definition = k === undefined ? undefined : definitions[k];
        return [
          {
            ...source(index),
            facetId: map.facet.id,
            facetVersion: map.facet.version,
            summaryProcessedAt: map.summaries[index]!.processedAt,
            runId: map.runId,
            topicId: definition?.topicId ?? null,
            topicVersionId: definition?.topicVersionId ?? null,
            distance: definition ? 0.05 + rng.next() * 0.2 : null,
            runnerUpDistance: definition ? 0.5 + rng.next() * 0.3 : null,
            origin: "initial",
            coordinates: coordinates(k, map.topics.length, rng),
            assignedAt: processedAt,
          },
        ];
      });
      ctx.log(`publishing ${map.runId} (${assignments.length} traces)`);
      await saveTopicRun({
        id: map.runId,
        projectId: ctx.projectId,
        facetId: map.facet.id,
        facetVersion: map.facet.version,
        status: "completed",
        createdAt: processedAt,
        startedAt: processedAt,
        finishedAt: processedAt,
        config,
        error: null,
        topics: definitions,
        ruleId: map.rule.id,
      });
      await writeTopicAssignments(assignments);
    }

    const queryParams = {
      projectId: ctx.projectId,
      traceIds,
      runIds: maps.map((map) => map.runId),
    };
    const verified: Record<string, number> = {
      traces: await countRows(
        "traces",
        "project_id = {projectId: String} AND id IN {traceIds: Array(String)}",
        queryParams,
        "uniqExact(id)",
      ),
      observations: await countRows(
        "observations",
        "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}",
        queryParams,
        "uniqExact(id)",
      ),
      events: await countRows(
        "events_full",
        "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}",
        queryParams,
        "uniqExact(span_id)",
      ),
      rules: (await listTopicRules(ctx.projectId)).filter((rule) =>
        (RULE_NAMES as readonly string[]).includes(rule.name),
      ).length,
      maps: await prisma.topicClusteringRun.count({
        where: {
          projectId: ctx.projectId,
          id: { in: maps.map((map) => map.runId) },
          status: "completed",
        },
      }),
      summaries: await countRows(
        "topic_facet_summaries",
        "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}",
        queryParams,
        "uniqExact(facet_id, trace_id)",
      ),
      assignments: await countRows(
        "topic_assignments",
        "project_id = {projectId: String} AND clustering_run_id IN {runIds: Array(String)}",
        queryParams,
        "uniqExact(clustering_run_id, trace_id)",
      ),
    };
    for (const [entity, expected] of Object.entries(counts)) {
      if (verified[entity] !== expected) {
        throw new SeedError(
          `Readback mismatch: expected ${expected} ${entity}, found ${verified[entity]}`,
        );
      }
    }
    return { ...summary, verified, durationMs: Date.now() - startedAt };
  },
};

/** Trace index → topic index, largest topic first; outliers map to undefined. */
function topicIndexes(topics: SeedTopic[], outliers: number) {
  const order = topics.flatMap((topic, k) =>
    Array.from({ length: topic.count }, () => k),
  );
  return [...order, ...Array.from({ length: outliers }, () => undefined)];
}

function unit(k: number) {
  return Array.from({ length: DIMENSIONS }, (_, i) =>
    i === k % DIMENSIONS ? 1 : 0,
  );
}

function embedding(k: number, rng: Rng) {
  const vector = unit(k).map((value) => value + rng.next() * 0.15);
  const norm = Math.hypot(...vector);
  return vector.map((value) => value / norm);
}

function summaryText(topic: SeedTopic | undefined, request: string) {
  return topic ? `${topic.name}: ${request}` : request;
}

/** Topics sit on a ring; outliers scatter across the whole plane. */
function coordinates(
  k: number | undefined,
  topicCount: number,
  rng: Rng,
): [number, number] {
  if (k === undefined) return [rng.next() * 20 - 10, rng.next() * 20 - 10];
  const angle = (k / topicCount) * Math.PI * 2;
  const spread = 0.6 + rng.next() * 1.4;
  const theta = rng.next() * Math.PI * 2;
  return [
    Math.cos(angle) * 6 + Math.cos(theta) * spread,
    Math.sin(angle) * 6 + Math.sin(theta) * spread,
  ];
}
