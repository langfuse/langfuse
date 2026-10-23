import { prisma } from "../../../src/db";
import {
  clickhouseClient,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { DOCS_DEMO_PROJECT_ID } from "./docs-demo-project";
import { observationToEvent } from "./event-mirror";
import { jitter, utcDayStartMs } from "./rng";
import { ScenarioDefinition, SeedError } from "./types";
import { countRows, traceLink } from "./verify";

/**
 * Curated data for the evaluation docs videos (annotation queues, manual
 * scoring, LLM-as-a-judge and code evaluators): four score configs, two
 * existing queues, and seven support-chat traces whose root span input carries
 * `payload.message` for evaluator variable mapping.
 *
 * Every run also removes what those scenes create (the "Error Analysis"
 * queue, annotation scores on these traces, and the evaluators built from
 * templates) so takes start from the same state.
 */
const ID_PREFIX = "0199a1c4e7d2b850";

type Category = { label: string; value: number };
const SCORE_CONFIGS: {
  key: string;
  name: string;
  dataType: "CATEGORICAL" | "NUMERIC" | "BOOLEAN";
  categories?: Category[];
  minValue?: number;
  maxValue?: number;
  description: string;
}[] = [
  {
    key: "accuracy",
    name: "Accuracy",
    dataType: "CATEGORICAL",
    categories: [
      { label: "Correct", value: 1 },
      { label: "Partially correct", value: 0.5 },
      { label: "Incorrect", value: 0 },
    ],
    description: "Is the answer factually correct for the customer's account?",
  },
  {
    key: "helpfulness",
    name: "Helpfulness",
    dataType: "NUMERIC",
    minValue: 1,
    maxValue: 5,
    description: "How well the reply resolves the request (1 = not at all).",
  },
  {
    key: "toxicity",
    name: "Toxicity",
    dataType: "BOOLEAN",
    categories: [
      { label: "True", value: 1 },
      { label: "False", value: 0 },
    ],
    description: "Does the reply contain rude or harmful language?",
  },
  {
    key: "first-pass",
    name: "First Pass",
    dataType: "CATEGORICAL",
    categories: [
      { label: "Good Output", value: 1 },
      { label: "Bad Output", value: 0 },
      { label: "Saved for Later", value: 2 },
    ],
    description: "Quick triage label for error analysis.",
  },
];

const EXISTING_QUEUES = [
  {
    key: "weekly-review",
    name: "Weekly Quality Review",
    description: "Random sample of support replies, reviewed every Monday.",
    configKeys: ["accuracy", "helpfulness"],
  },
  {
    key: "escalations",
    name: "Escalated Conversations",
    description: "Chats handed over to a human agent.",
    configKeys: ["accuracy", "toxicity"],
  },
];

/** Names the scenes create; removed on every run. */
const SCENE_QUEUE_NAMES = ["Error Analysis"];
const SCENE_EVALUATOR_NAMES = [
  "Classify Input Topic",
  "Detect User Frustration (ALL CAPS)",
  "Detect Out-of-Scope Request",
];

const SYSTEM_PROMPT =
  "You are Acme's customer support assistant. Answer briefly and link a help article when one fits.";

const CONVERSATIONS: {
  message: string;
  answer: string;
  article: { title: string; url: string };
  user: string;
  tags: string[];
}[] = [
  {
    message: "How do I export my invoices as PDF?",
    answer:
      "Open Settings → Billing → Invoices and click Download next to any invoice. To export several at once, select them and choose Export as PDF.",
    article: {
      title: "Download invoices",
      url: "https://help.acme.dev/billing/invoices",
    },
    user: "lena.fischer@northwind.io",
    tags: ["billing"],
  },
  {
    message: "Our API calls return 401 errors since this morning.",
    answer:
      "A 401 means the API key was rejected. Keys created before the March rotation expired today; create a new key under Settings → API Keys and update your integration.",
    article: {
      title: "Rotate API keys",
      url: "https://help.acme.dev/api/keys",
    },
    user: "dev-team@brightlane.com",
    tags: ["technical"],
  },
  {
    message: "Can I upgrade to the Team plan in the middle of my cycle?",
    answer:
      "Yes. Upgrades apply immediately and we prorate the rest of your current cycle, so you only pay the difference.",
    article: {
      title: "Change your plan",
      url: "https://help.acme.dev/billing/plans",
    },
    user: "marco.rossi@kitewave.co",
    tags: ["billing"],
  },
  {
    message: "Please add a dark mode to the mobile app!",
    answer:
      "Thanks for the suggestion! Dark mode is on our roadmap for the mobile app. I've added your vote to the request.",
    article: {
      title: "Product roadmap",
      url: "https://help.acme.dev/roadmap",
    },
    user: "sam.okafor@gmail.com",
    tags: ["feedback"],
  },
  {
    message: "I forgot my password and the reset email never arrives.",
    answer:
      "Reset emails come from no-reply@acme.dev and can take a few minutes. Check your spam folder; if it is not there, I can trigger a new reset link for you.",
    article: {
      title: "Reset your password",
      url: "https://help.acme.dev/account/password",
    },
    user: "priya.nair@outlook.com",
    tags: ["account"],
  },
  {
    message: "Do you offer discounts for nonprofit organizations?",
    answer:
      "We do: registered nonprofits get 50% off the Team plan. Apply with proof of status via the nonprofit form and we'll update your subscription.",
    article: {
      title: "Nonprofit program",
      url: "https://help.acme.dev/billing/nonprofit",
    },
    user: "hello@greenroots.org",
    tags: ["sales"],
  },
  {
    message: "MY INVOICE STILL SHOWS THE OLD PLAN. PLEASE FIX THIS TODAY!",
    answer:
      "Sorry about that! Plan changes can take up to an hour to reach invoices. I've regenerated your latest invoice with the Team plan; it's available under Settings → Billing now.",
    article: {
      title: "Invoice corrections",
      url: "https://help.acme.dev/billing/corrections",
    },
    user: "ops@quantumleaf.io",
    tags: ["billing"],
  },
];

/** Stable, random-looking 32-char hex ids (the trace header shows them). */
/** Clears the test-factory defaults (prompt link, status, usage, cost). */
const OBSERVATION_DEFAULTS = {
  level: "DEFAULT",
  status_message: null,
  version: null,
  internal_model_id: null,
  prompt_id: null,
  prompt_name: null,
  prompt_version: null,
  provided_model_name: null,
  model_parameters: "{}",
  provided_usage_details: {},
  usage_details: {},
  provided_cost_details: {},
  cost_details: {},
  total_cost: 0,
  metadata: {},
} as const;

const hexId = (index: number, suffix: number) => {
  const n = index * 16 + suffix;
  const word = (salt: number) =>
    jitter(salt, n, 0xffffffff).toString(16).padStart(8, "0");
  return `${ID_PREFIX}${word(0x5eed)}${word(0xbeef)}`;
};

function summary(
  ctx: Parameters<ScenarioDefinition["run"]>[0],
  startedAt: number,
  traceIds: string[],
  timestamps: number[],
  verified: Record<string, number>,
  dryRun: boolean,
  written: Record<string, number> = {},
) {
  return {
    scenario: "docs-demo-evals",
    target: "clickhouse" as const,
    params: {},
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds,
    sessionIds: [],
    counts: {
      scoreConfigs: SCORE_CONFIGS.length,
      queues: EXISTING_QUEUES.length,
      traces: traceIds.length,
      ...written,
    },
    verified,
    links: [
      ...traceIds.map((id, i) => traceLink(ctx, id, timestamps[i])),
      `${ctx.baseUrl}/project/${ctx.projectId}/annotation-queues`,
      `${ctx.baseUrl}/project/${ctx.projectId}/evals`,
    ],
    dryRun,
    durationMs: Date.now() - startedAt,
  };
}

export const docsDemoEvalsScenario: ScenarioDefinition = {
  name: "docs-demo-evals",
  description:
    "Docs-video data for evaluation pages: score configs (Accuracy, Helpfulness 1-5, Toxicity, First Pass), two existing annotation queues and seven support-chat traces with payload.message root input. Each run resets the queue, annotation scores and evaluators the docs scenes create. Use --project docs-demo.",
  supportsV4: true,
  flags: [
    {
      flag: "rewrite",
      type: "boolean",
      default: false,
      description:
        "re-insert the traces even when they already exist (after editing their content)",
    },
  ],
  run: async (ctx, params) => {
    const startedAt = Date.now();
    if (ctx.projectId !== DOCS_DEMO_PROJECT_ID) {
      throw new SeedError(
        `docs-demo-evals seeds the docs demo project, got ${ctx.projectId}`,
        "pass --project docs-demo (run docs-demo-project first)",
      );
    }
    // Most recent trace ~20 min before today's UTC midnight, spaced 7 min.
    const endMs = utcDayStartMs() - 20 * 60 * 1000;
    const traces: TraceRecordInsertType[] = [];
    const observations: ObservationRecordInsertType[] = [];
    const events: EventRecordInsertType[] = [];
    const timestamps: number[] = [];

    CONVERSATIONS.forEach((c, i) => {
      const traceId = hexId(i, 0);
      const ts = endMs - (5 - i) * 7 * 60 * 1000 - jitter(ctx.seed, i, 40_000);
      timestamps.push(ts);
      const now = Date.now();
      const trace = createTrace({
        id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        name: "qa-chatbot",
        timestamp: ts,
        user_id: c.user,
        session_id: null,
        release: null,
        version: null,
        tags: c.tags,
        public: false,
        bookmarked: false,
        metadata: { channel: "web-chat" },
        input: JSON.stringify({ payload: { message: c.message } }),
        output: JSON.stringify(c.answer),
        created_at: now,
        updated_at: now,
        event_ts: now,
      });
      traces.push(trace);

      // A real root span (as OTel ingestion writes it) instead of the
      // synthetic `t-<traceId>` span, so annotation-queue items and evaluator
      // samples reference a proper observation id.
      const rootId = hexId(i, 3);
      const root = createObservation({
        id: rootId,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: "SPAN",
        name: "qa-chatbot",
        start_time: ts,
        end_time: ts + 2600 + jitter(ctx.seed, i + 300, 600),
        ...OBSERVATION_DEFAULTS,
        input: trace.input,
        output: trace.output,
        created_at: now,
        updated_at: now,
        event_ts: now,
      });
      observations.push(root);
      events.push({ ...observationToEvent(root, trace), parent_span_id: "" });

      const promptTokens = 180 + jitter(ctx.seed, i + 100, 60);
      const completionTokens = 40 + jitter(ctx.seed, i + 200, 30);
      const children: ObservationRecordInsertType[] = [
        createObservation({
          id: hexId(i, 1),
          trace_id: traceId,
          parent_observation_id: rootId,
          project_id: ctx.projectId,
          environment: ctx.environment,
          type: "RETRIEVER",
          name: "search-help-center",
          start_time: ts + 40,
          end_time: ts + 310,
          ...OBSERVATION_DEFAULTS,
          input: JSON.stringify({ query: c.message }),
          output: JSON.stringify([c.article]),
          created_at: now,
          updated_at: now,
          event_ts: now,
        }),
        createObservation({
          id: hexId(i, 2),
          trace_id: traceId,
          parent_observation_id: rootId,
          project_id: ctx.projectId,
          environment: ctx.environment,
          type: "GENERATION",
          name: "generate-answer",
          start_time: ts + 330,
          end_time: ts + 2500 + jitter(ctx.seed, i + 300, 600),
          completion_start_time: ts + 720,
          ...OBSERVATION_DEFAULTS,
          input: JSON.stringify([
            {
              role: "system",
              content: `${SYSTEM_PROMPT}\n\nRelevant article: ${c.article.title} (${c.article.url})`,
            },
            { role: "user", content: c.message },
          ]),
          output: JSON.stringify({ role: "assistant", content: c.answer }),
          provided_model_name: "gpt-4.1-mini",
          model_parameters: JSON.stringify({ temperature: 0.2 }),
          provided_usage_details: {
            input: promptTokens,
            output: completionTokens,
            total: promptTokens + completionTokens,
          },
          usage_details: {
            input: promptTokens,
            output: completionTokens,
            total: promptTokens + completionTokens,
          },
          cost_details: {
            input: promptTokens * 0.0000004,
            output: completionTokens * 0.0000016,
            total: promptTokens * 0.0000004 + completionTokens * 0.0000016,
          },
          total_cost: promptTokens * 0.0000004 + completionTokens * 0.0000016,
          created_at: now,
          updated_at: now,
          event_ts: now,
        }),
      ];
      for (const o of children) {
        observations.push(o);
        events.push(observationToEvent(o, trace));
      }
    });
    const traceIds = traces.map((t) => t.id);

    if (ctx.dryRun) {
      return summary(ctx, startedAt, traceIds, timestamps, {}, true);
    }

    // --- Reset what the scenes create -------------------------------------
    await prisma.annotationQueue.deleteMany({
      where: { projectId: ctx.projectId, name: { in: SCENE_QUEUE_NAMES } },
    });
    const sceneEvaluators = await prisma.evaluator.findMany({
      where: { projectId: ctx.projectId, name: { in: SCENE_EVALUATOR_NAMES } },
      select: { id: true, assignments: { select: { evaluationRuleId: true } } },
    });
    const ruleIds = sceneEvaluators.flatMap((e) =>
      e.assignments.map((a) => a.evaluationRuleId),
    );
    await prisma.evaluator.deleteMany({
      where: { id: { in: sceneEvaluators.map((e) => e.id) } },
    });
    if (ruleIds.length > 0) {
      await prisma.evaluationRule.deleteMany({
        where: { projectId: ctx.projectId, id: { in: ruleIds } },
      });
    }
    await clickhouseClient().command({
      query: `DELETE FROM scores WHERE project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
      query_params: { projectId: ctx.projectId, traceIds },
      clickhouse_settings: { wait_end_of_query: 1 },
    });

    // --- Score configs and existing queues (Postgres) ---------------------
    const configIds: Record<string, string> = {};
    for (const def of SCORE_CONFIGS) {
      const id = `docs-demo-cfg-${def.key}`;
      configIds[def.key] = id;
      const data = {
        name: def.name,
        dataType: def.dataType,
        isArchived: false,
        description: def.description,
        minValue: def.minValue ?? null,
        maxValue: def.maxValue ?? null,
        ...(def.categories ? { categories: def.categories } : {}),
      };
      await prisma.scoreConfig.upsert({
        where: { id },
        update: data,
        create: { id, projectId: ctx.projectId, ...data },
      });
    }
    for (const q of EXISTING_QUEUES) {
      const id = `docs-demo-queue-${q.key}`;
      const data = {
        name: q.name,
        description: q.description,
        scoreConfigIds: q.configKeys.map((k) => configIds[k]),
      };
      await prisma.annotationQueue.upsert({
        where: { id },
        update: data,
        create: { id, projectId: ctx.projectId, ...data },
      });
      // Scenes add items to these queues too; start every take empty.
      await prisma.annotationQueueItem.deleteMany({
        where: { projectId: ctx.projectId, queueId: id },
      });
    }

    // --- Default evaluation model -----------------------------------------
    // Points the judge picker at the project's `openai` connection (created
    // by docs-demo-project when an LLM key is configured).
    const connection = await prisma.llmApiKeys.findUnique({
      where: {
        projectId_provider: { projectId: ctx.projectId, provider: "openai" },
      },
      select: { id: true },
    });
    if (connection) {
      const model = {
        llmApiKeyId: connection.id,
        provider: "openai",
        adapter: "openai",
        model: "gpt-4.1-mini",
      };
      await prisma.defaultLlmModel.upsert({
        where: { projectId: ctx.projectId },
        update: model,
        create: { projectId: ctx.projectId, ...model },
      });
    } else {
      ctx.log("no 'openai' LLM connection; skipping the default eval model");
    }

    // --- Traces (ClickHouse, v3 + v4) -------------------------------------
    // Re-inserting identical rows leaves duplicates visible until
    // ClickHouse merges them, so takes right after a seed would show every
    // trace twice. Skip the write while today's rows are in place; when they
    // are missing or anchored to an earlier day (and would drop out of the
    // UI's default "Past 1 day" range), delete them and write fresh ones.
    const currentEvents = await countRows(
      "events_full",
      "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)} AND toUnixTimestamp64Milli(start_time) >= {fromMs: Int64}",
      { projectId: ctx.projectId, traceIds, fromMs: Math.min(...timestamps) },
    );
    if (params.rewrite === true || currentEvents !== events.length) {
      for (const table of ["events_full", "events_core", "observations"]) {
        await clickhouseClient().command({
          query: `DELETE FROM ${table} WHERE project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
          query_params: { projectId: ctx.projectId, traceIds },
          clickhouse_settings: { wait_end_of_query: 1 },
        });
      }
      await clickhouseClient().command({
        query: `DELETE FROM traces WHERE project_id = {projectId: String} AND id IN {traceIds: Array(String)}`,
        query_params: { projectId: ctx.projectId, traceIds },
        clickhouse_settings: { wait_end_of_query: 1 },
      });
      await createTracesCh(traces);
      await createObservationsCh(observations);
      await createEventsCh(events);
    } else {
      ctx.log("traces already seeded; skipping ClickHouse writes");
    }

    const verified = {
      traces: await countRows(
        "traces",
        "project_id = {projectId: String} AND id IN {traceIds: Array(String)}",
        { projectId: ctx.projectId, traceIds },
        "uniqExact(id)",
      ),
      events: await countRows(
        "events_full",
        "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}",
        { projectId: ctx.projectId, traceIds },
        "uniqExact(span_id)",
      ),
      scoreConfigs: await prisma.scoreConfig.count({
        where: { id: { in: Object.values(configIds) } },
      }),
    };
    if (
      verified.traces < traces.length ||
      verified.events < events.length ||
      verified.scoreConfigs < SCORE_CONFIGS.length
    ) {
      throw new SeedError(
        `Readback mismatch: ${JSON.stringify(verified)} (expected ${traces.length} traces, ${events.length} events, ${SCORE_CONFIGS.length} score configs)`,
      );
    }
    return summary(ctx, startedAt, traceIds, timestamps, verified, false, {
      traces: traces.length,
      observations: observations.length,
      events: events.length,
    });
  },
};
