import { prisma } from "../../../src/db";
import {
  clickhouseClient,
  createEvent,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createScoresCh,
  createTrace,
  createTracesCh,
  createTraceScore,
  EventRecordInsertType,
  ScoreRecordInsertType,
  toClickhouseDateTime,
} from "../../../src/server";
import { DOCS_DEMO_PROJECT_ID } from "./docs-demo-project";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, utcDayStartMs } from "./rng";
import { ScenarioDefinition, SeedError, SeedSummary } from "./types";
import { countRows, traceLink } from "./verify";

/**
 * Curated data for the datasets and experiments docs videos in the
 * docs-demo project: the `san-francisco-sites` dataset from the evaluation
 * quickstart, a `capital-cities` dataset with four finished experiments
 * (three SDK runs plus one prompt experiment, with linked traces and
 * boolean/numeric scores), the `answer-question` prompt those experiments
 * use, a few customer-support datasets, and one `support-chat` trace whose
 * generation the add-to-dataset scene saves.
 *
 * Every run resets what the scenes create: dataset items are rewritten from
 * scratch and runs that the prompt-experiment scene adds are removed.
 */
const ID_PREFIX = "0199b3d5f1a2c860";
const DAY_MS = 86_400_000;

type SeedItem = {
  id: string;
  input: unknown;
  expectedOutput: unknown;
  metadata?: Record<string, string>;
};

const SF_ITEMS: SeedItem[] = [
  {
    id: "evaluation-quickstart-sf-golden-gate-bridge",
    input: {
      question:
        "Which red-orange suspension bridge connects San Francisco with Marin County?",
    },
    expectedOutput: "Golden Gate Bridge",
  },
  {
    id: "evaluation-quickstart-sf-alcatraz-island",
    input: {
      question:
        "Which island in San Francisco Bay is home to a former federal prison?",
    },
    expectedOutput: "Alcatraz Island",
  },
  {
    id: "evaluation-quickstart-sf-palace-of-fine-arts",
    input: {
      question:
        "Which Beaux-Arts landmark in the Marina District features a rotunda beside a lagoon?",
    },
    expectedOutput: "Palace of Fine Arts",
  },
  {
    id: "evaluation-quickstart-sf-lombard-street",
    input: {
      question:
        "Which San Francisco street is famous for a steep block with eight hairpin turns?",
    },
    expectedOutput: "Lombard Street",
  },
];

const CAPITALS: [country: string, capital: string][] = [
  ["France", "Paris"],
  ["Germany", "Berlin"],
  ["Italy", "Rome"],
  ["Spain", "Madrid"],
  ["Japan", "Tokyo"],
  ["Australia", "Canberra"],
  ["Canada", "Ottawa"],
  ["Brazil", "Brasília"],
  ["Turkey", "Ankara"],
  ["Switzerland", "Bern"],
  ["South Africa", "Pretoria"],
];

const SUPPORT_DATASETS: {
  key: string;
  name: string;
  description: string;
  items: SeedItem[];
}[] = [
  {
    key: "replies",
    name: "support-replies",
    description: "Customer questions with the reply our support team approved.",
    items: [
      {
        id: "reset-password",
        input: {
          message: "I forgot my password and the reset email never arrives.",
        },
        expectedOutput:
          "Check your spam folder first. If it is not there, I can resend the reset link to your account email right away.",
      },
      {
        id: "cancel-plan",
        input: { message: "How do I cancel my Pro plan before it renews?" },
        expectedOutput:
          "Go to Settings → Billing → Manage plan and choose Cancel. Your plan stays active until the end of the billing period.",
      },
      {
        id: "export-invoices",
        input: {
          message: "Can I download all invoices from last year at once?",
        },
        expectedOutput:
          "Yes. In Settings → Billing → Invoices, filter by year and click Download all to get a ZIP file.",
      },
    ],
  },
  {
    key: "refunds",
    name: "refund-requests",
    description: "Refund requests and whether the policy allows them.",
    items: [
      {
        id: "duplicate-charge",
        input: {
          message: "I was charged twice for my subscription this month.",
        },
        expectedOutput: { eligible: true, action: "refund_duplicate" },
      },
      {
        id: "late-request",
        input: {
          message:
            "Can I get a refund for the annual plan I bought in January?",
        },
        expectedOutput: { eligible: false, action: "explain_policy" },
      },
    ],
  },
  {
    key: "triage",
    name: "escalation-triage",
    description: "Tickets labeled with the team that should own them.",
    items: [
      {
        id: "api-outage",
        input: { message: "Every API call returns 503 since this morning." },
        expectedOutput: { team: "engineering", priority: "urgent" },
      },
      {
        id: "invoice-vat",
        input: { message: "Our invoice is missing the VAT number." },
        expectedOutput: { team: "billing", priority: "normal" },
      },
    ],
  },
  {
    key: "screenshots",
    name: "support-screenshots",
    description:
      "Screenshots customers attached to tickets, with the expected triage.",
    items: [
      {
        id: "blank-dashboard",
        input: {
          question:
            "My dashboard is blank after logging in. What should I try?",
        },
        expectedOutput: {
          category: "bug",
          reply: "Clear the browser cache or try a private window.",
        },
      },
    ],
  },
];

const PROMPT_NAME = "answer-question";
const PROMPT_VERSIONS: { text: string; labels: string[]; message: string }[] = [
  {
    text: "What is the capital of {{country}}?",
    labels: [],
    message: "First draft",
  },
  {
    text: "What is the capital of {{country}}? Reply with the city name only.",
    labels: ["production"],
    message: "Ask for the city name only",
  },
  {
    text: "You are a geography expert. What is the capital of {{country}}? Reply with the city name only, without punctuation.",
    labels: ["latest"],
    message: "Add role and formatting rule",
  },
];

type Run = {
  key: string;
  name: string;
  description: string;
  daysAgo: number;
  model: string;
  promptVersion: number;
  output: (country: string, capital: string) => string;
  metadata?: Record<string, unknown>;
};

const FAMOUS: Record<string, string> = {
  Spain: "Barcelona",
  Australia: "Sydney",
  Canada: "Toronto",
  Brazil: "Rio de Janeiro",
  Turkey: "Istanbul",
  Switzerland: "Zurich",
  "South Africa": "Cape Town",
};

const RUNS: Run[] = [
  {
    key: "famous-city",
    name: "famous-city",
    description: "Asks for the most famous city of the country.",
    daysAgo: 3,
    model: "gpt-4.1-mini",
    promptVersion: 1,
    output: (country, capital) => FAMOUS[country] ?? capital,
  },
  {
    key: "directly-ask",
    name: "directly-ask",
    description: "Asks for the capital in a full sentence.",
    daysAgo: 2,
    model: "gpt-4.1-mini",
    promptVersion: 1,
    output: (country, capital) => `The capital of ${country} is ${capital}.`,
  },
  {
    key: "asking-specifically",
    name: "asking-specifically",
    description: "Asks for the capital and the city name only.",
    daysAgo: 1,
    model: "gpt-4.1-mini",
    promptVersion: 2,
    output: (country, capital) => (country === "Brazil" ? "Brasilia" : capital),
  },
  {
    key: "prompt-v2-gpt-4-1",
    name: "Prompt answer-question-v2 on dataset capital-cities",
    description:
      "Prompt experiment: answer-question v2 with gpt-4.1 on capital-cities",
    daysAgo: 0,
    model: "gpt-4.1",
    promptVersion: 2,
    output: (_country, capital) => capital,
  },
];

/** Character-level similarity in [0, 1], rounded to two decimals. */
function similarity(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) =>
    Array.from({ length: y.length + 1 }, (_, j) =>
      i === 0 || j === 0 ? i + j : 0,
    ),
  );
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
  }
  const max = Math.max(x.length, y.length) || 1;
  return Math.round((1 - d[x.length][y.length] / max) * 100) / 100;
}

const REPLY_SYSTEM =
  "You are Acme's support assistant. Answer using the help-center articles provided. Keep replies short and friendly.";
const REPLY_QUESTION = "How do I change the email address on my account?";
const REPLY_ANSWER =
  "You can change it in Settings → Profile → Email. Enter the new address and confirm it from the verification email we send you. Your login and invoices switch to the new address right away.";

function summary(
  ctx: Parameters<ScenarioDefinition["run"]>[0],
  startedAt: number,
  counts: Record<string, number>,
  verified: Record<string, number>,
  ids: { sf: string; capitals: string },
  chatTraceId: string,
  chatTs: number,
  dryRun: boolean,
): SeedSummary {
  const datasets = `${ctx.baseUrl}/project/${ctx.projectId}/datasets`;
  return {
    scenario: "docs-demo-datasets",
    target: "clickhouse",
    params: {},
    projectId: ctx.projectId ?? DOCS_DEMO_PROJECT_ID,
    environment: ctx.environment,
    traceIds: [chatTraceId],
    sessionIds: [],
    counts,
    verified,
    links: [
      `${datasets}/${ids.sf}/items`,
      `${datasets}/${ids.capitals}/experiments`,
      traceLink(ctx, chatTraceId, chatTs),
      `${datasets}/docs-demo-ds-support-screenshots/items`,
    ],
    dryRun,
    durationMs: Date.now() - startedAt,
  };
}

export const docsDemoDatasetsScenario: ScenarioDefinition = {
  name: "docs-demo-datasets",
  description:
    "Datasets and experiments for the docs-demo project: san-francisco-sites (quickstart), capital-cities with four finished experiments (linked v4 traces, exact_match boolean + similarity numeric scores), the answer-question prompt (3 versions, {{country}}), four support datasets, and a support-chat trace for add-to-dataset. Re-runs rewrite dataset items and delete runs created by the scenes.",
  supportsV4: true,
  flags: [
    {
      flag: "sf-items",
      type: "number",
      default: 4,
      description:
        "how many san-francisco-sites items to seed (0 = empty dataset for the CSV upload scene)",
    },
  ],
  run: async (ctx, params): Promise<SeedSummary> => {
    const startedAt = Date.now();
    const sfCount = Number(params["sf-items"]);
    if (
      !Number.isInteger(sfCount) ||
      sfCount < 0 ||
      sfCount > SF_ITEMS.length
    ) {
      throw new SeedError(`sf-items must be between 0 and ${SF_ITEMS.length}`);
    }
    const project = await prisma.project.findUnique({
      where: { id: ctx.projectId },
    });
    if (!project) {
      throw new SeedError(
        `project ${ctx.projectId} not found`,
        "pnpm run seed -- docs-demo-project",
      );
    }

    const today = utcDayStartMs();
    const itemsCreatedAt = today - 7 * DAY_MS + 10 * 3_600_000;
    const validFrom = new Date(itemsCreatedAt);
    const ids = {
      sf: "docs-demo-ds-san-francisco-sites",
      capitals: "docs-demo-ds-capital-cities",
    };
    const supportIds = Object.fromEntries(
      SUPPORT_DATASETS.map((d) => [d.key, `docs-demo-ds-${d.name}`]),
    );
    const datasets = [
      {
        id: ids.sf,
        name: "san-francisco-sites",
        description:
          "Questions and expected answers about sites in San Francisco",
        items: SF_ITEMS.slice(0, sfCount),
      },
      {
        id: ids.capitals,
        name: "capital-cities",
        description: "Countries and their capital cities",
        items: CAPITALS.map(
          ([country, capital]): SeedItem => ({
            id: `capital-cities-${country.toLowerCase().replace(/ /g, "-")}`,
            input: { country },
            expectedOutput: capital,
          }),
        ),
      },
      ...SUPPORT_DATASETS.map((d) => ({
        id: supportIds[d.key],
        name: d.name,
        description: d.description,
        items: d.items.map((item) => ({ ...item, id: `${d.name}-${item.id}` })),
      })),
    ];
    const datasetIds = datasets.map((d) => d.id);
    const capitalItems = datasets[1].items;

    // --- Experiments: one root span + one generation per item, v4 only ----
    const promptIds = PROMPT_VERSIONS.map(
      (_, i) => `docs-demo-prompt-answer-question-v${i + 1}`,
    );
    const runIds = RUNS.map((r) => `docs-demo-run-${r.key}`);
    const events: EventRecordInsertType[] = [];
    const scores: ScoreRecordInsertType[] = [];
    RUNS.forEach((run, runIndex) => {
      const runStart = today - run.daysAgo * DAY_MS - DAY_MS + 15 * 3_600_000;
      capitalItems.forEach((item, itemIndex) => {
        const [country, capital] = CAPITALS[itemIndex];
        const row = runIndex * capitalItems.length + itemIndex;
        const start = runStart + itemIndex * 2_300 + jitter(ctx.seed, row, 400);
        const latency = 520 + jitter(ctx.seed, row + 97, 900);
        const traceId = `${ID_PREFIX}${String(runIndex).padStart(2, "0")}${String(itemIndex).padStart(2, "0")}`;
        const rootId = `${traceId}-root`;
        const genId = `${traceId}-gen`;
        const output = run.output(country, capital);
        const promptText = PROMPT_VERSIONS[run.promptVersion - 1].text.replace(
          "{{country}}",
          country,
        );
        const inputTokens = 14 + promptText.split(" ").length * 2;
        const outputTokens = Math.max(2, output.split(" ").length * 2);
        const price =
          run.model === "gpt-4.1"
            ? { input: 2e-6, output: 8e-6 }
            : { input: 4e-7, output: 1.6e-6 };
        const cost = {
          input: inputTokens * price.input,
          output: outputTokens * price.output,
        };
        const experiment = {
          experiment_id: runIds[runIndex],
          experiment_name: run.name,
          experiment_description: run.description,
          experiment_dataset_id: ids.capitals,
          experiment_item_id: item.id,
          experiment_item_version: toClickhouseDateTime(validFrom),
          experiment_item_root_span_id: rootId,
          experiment_item_expected_output: JSON.stringify(capital),
        };
        const common = {
          project_id: ctx.projectId,
          trace_id: traceId,
          trace_name: "capital-cities-task",
          environment: ctx.environment,
          metadata_names: ["dataset"],
          metadata_values: ["capital-cities"],
          created_at: start,
          updated_at: start,
          event_ts: start,
          ...experiment,
        };
        events.push(
          createEvent({
            ...common,
            id: rootId,
            span_id: rootId,
            parent_span_id: "",
            name: "capital-cities-task",
            type: "SPAN",
            input: JSON.stringify({ country }),
            output: JSON.stringify(output),
            provided_model_name: null,
            provided_usage_details: {},
            usage_details: {},
            provided_cost_details: {},
            cost_details: {},
            start_time: start,
            end_time: start + latency + 40,
            event_bytes: 64,
          }),
          createEvent({
            ...common,
            id: genId,
            span_id: genId,
            parent_span_id: rootId,
            name: PROMPT_NAME,
            type: "GENERATION",
            input: JSON.stringify([{ role: "user", content: promptText }]),
            output: JSON.stringify({ role: "assistant", content: output }),
            provided_model_name: run.model,
            model_parameters: JSON.stringify({ temperature: 0 }),
            prompt_id: promptIds[run.promptVersion - 1],
            prompt_name: PROMPT_NAME,
            prompt_version: run.promptVersion,
            provided_usage_details: {
              input: inputTokens,
              output: outputTokens,
              total: inputTokens + outputTokens,
            },
            usage_details: {
              input: inputTokens,
              output: outputTokens,
              total: inputTokens + outputTokens,
            },
            provided_cost_details: {},
            cost_details: { ...cost, total: cost.input + cost.output },
            start_time: start + 20,
            end_time: start + 20 + latency,
            completion_start_time: start + 20 + Math.round(latency * 0.6),
            event_bytes: 128,
          }),
        );
        const scoreBase = {
          project_id: ctx.projectId,
          trace_id: traceId,
          observation_id: null,
          environment: ctx.environment,
          source: "EVAL" as const,
          comment: null,
          metadata: {},
          timestamp: start + latency + 500,
          created_at: start + latency + 500,
          updated_at: start + latency + 500,
          event_ts: start + latency + 500,
        };
        const exact = output === capital;
        scores.push(
          createTraceScore({
            ...scoreBase,
            id: `${traceId}-exact-match`,
            name: "exact_match",
            value: exact ? 1 : 0,
            string_value: exact ? "True" : "False",
            data_type: "BOOLEAN",
          }),
          createTraceScore({
            ...scoreBase,
            id: `${traceId}-similarity`,
            name: "similarity",
            value: similarity(output, capital),
            data_type: "NUMERIC",
          }),
        );
      });
    });
    const experimentTraceIds = [...new Set(events.map((e) => e.trace_id))];

    // --- Support-chat trace for "add to dataset" (v3 + v4 mirror) ---------
    const chatTraceId = `${ID_PREFIX}c4a7`;
    const chatTs = today - DAY_MS + 14 * 3_600_000 + 12 * 60_000;
    const trace = createTrace({
      id: chatTraceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      name: "support-chat",
      timestamp: chatTs,
      user_id: "jordan.lee@northwind.io",
      session_id: null,
      release: "2026.10.18",
      version: "support-bot-v2",
      tags: ["support", "account"],
      public: false,
      bookmarked: false,
      metadata: { channel: "help-widget" },
      input: JSON.stringify({ message: REPLY_QUESTION }),
      output: JSON.stringify({ reply: REPLY_ANSWER }),
      created_at: chatTs,
      updated_at: chatTs,
      event_ts: chatTs,
    });
    const articles = [
      { id: "kb-112", title: "Change your account email", score: 0.91 },
      { id: "kb-087", title: "Verify a new email address", score: 0.84 },
    ];
    const replyInputTokens = 412;
    const replyOutputTokens = 58;
    const replyCost = {
      input: replyInputTokens * 4e-7,
      output: replyOutputTokens * 1.6e-6,
    };
    const observations = [
      createObservation({
        id: `${chatTraceId}-retrieve`,
        trace_id: chatTraceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: "RETRIEVER",
        parent_observation_id: null,
        name: "search-help-center",
        start_time: chatTs + 15,
        end_time: chatTs + 240,
        completion_start_time: null,
        level: "DEFAULT",
        status_message: null,
        version: null,
        input: JSON.stringify({ query: REPLY_QUESTION, top_k: 2 }),
        output: JSON.stringify({ documents: articles }),
        metadata: { index: "help-center-en" },
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
        created_at: chatTs,
        updated_at: chatTs,
        event_ts: chatTs,
      }),
      createObservation({
        id: `${chatTraceId}-reply`,
        trace_id: chatTraceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: "GENERATION",
        parent_observation_id: null,
        name: "generate-reply",
        start_time: chatTs + 260,
        end_time: chatTs + 1_940,
        completion_start_time: chatTs + 610,
        level: "DEFAULT",
        status_message: null,
        version: null,
        input: JSON.stringify([
          { role: "system", content: REPLY_SYSTEM },
          {
            role: "user",
            content: `Articles: ${articles.map((a) => a.title).join("; ")}\n\nQuestion: ${REPLY_QUESTION}`,
          },
        ]),
        output: JSON.stringify({ role: "assistant", content: REPLY_ANSWER }),
        metadata: {},
        provided_model_name: "gpt-4.1-mini",
        internal_model_id: null,
        model_parameters: JSON.stringify({ temperature: 0.3, max_tokens: 300 }),
        provided_usage_details: {
          input: replyInputTokens,
          output: replyOutputTokens,
          total: replyInputTokens + replyOutputTokens,
        },
        usage_details: {
          input: replyInputTokens,
          output: replyOutputTokens,
          total: replyInputTokens + replyOutputTokens,
        },
        provided_cost_details: {},
        cost_details: {
          ...replyCost,
          total: replyCost.input + replyCost.output,
        },
        total_cost: replyCost.input + replyCost.output,
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        created_at: chatTs,
        updated_at: chatTs,
        event_ts: chatTs,
      }),
    ];
    const chatEvents = [
      traceToEvent(trace),
      ...observations.map((o) => observationToEvent(o, trace)),
    ];
    const allTraceIds = [...experimentTraceIds, chatTraceId];

    const counts = {
      datasets: datasets.length,
      datasetItems: datasets.reduce((n, d) => n + d.items.length, 0),
      experiments: RUNS.length,
      promptVersions: PROMPT_VERSIONS.length,
      events: events.length + chatEvents.length,
      scores: scores.length,
    };
    if (ctx.dryRun) {
      return summary(
        ctx,
        startedAt,
        counts,
        {},
        ids,
        chatTraceId,
        chatTs,
        true,
      );
    }

    // --- Reset: rows from an earlier day carry other ORDER BY timestamps ----
    // Same-day re-runs replace rows in place, so only delete when stale
    // rows exist (lightweight deletes are expensive on a busy dev server).
    // The oldest run starts here today; yesterday's copy starts a day earlier.
    const earliest =
      today - (Math.max(...RUNS.map((r) => r.daysAgo)) + 1) * DAY_MS;
    const stale = await countRows(
      "events_full",
      "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)} AND start_time < fromUnixTimestamp64Milli({earliest: Int64})",
      { projectId: ctx.projectId, traceIds: allTraceIds, earliest },
    );
    if (stale > 0) {
      ctx.log(`removing ${stale} rows from an earlier day`);
      for (const table of ["events_full", "events_core", "scores"]) {
        await clickhouseClient().command({
          query: `DELETE FROM ${table} WHERE project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
          query_params: { projectId: ctx.projectId, traceIds: allTraceIds },
          clickhouse_settings: { wait_end_of_query: 1 },
        });
      }
      for (const table of ["traces", "observations"]) {
        const column = table === "traces" ? "id" : "trace_id";
        await clickhouseClient().command({
          query: `DELETE FROM ${table} WHERE project_id = {projectId: String} AND ${column} = {traceId: String}`,
          query_params: { projectId: ctx.projectId, traceId: chatTraceId },
          clickhouse_settings: { wait_end_of_query: 1 },
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const [index, d] of datasets.entries()) {
        const data = {
          name: d.name,
          description: d.description,
          createdAt: new Date(
            itemsCreatedAt - (datasets.length - index) * 60_000,
          ),
        };
        await tx.dataset.upsert({
          where: { id_projectId: { id: d.id, projectId: ctx.projectId } },
          create: { id: d.id, projectId: ctx.projectId, ...data },
          update: data,
        });
      }
      await tx.datasetItem.deleteMany({
        where: { projectId: ctx.projectId, datasetId: { in: datasetIds } },
      });
      await tx.datasetItem.createMany({
        data: datasets.flatMap((d) =>
          d.items.map((item, index) => ({
            id: item.id,
            projectId: ctx.projectId,
            datasetId: d.id,
            input: item.input as object,
            expectedOutput: item.expectedOutput as object,
            metadata: item.metadata,
            validFrom,
            createdAt: new Date(itemsCreatedAt + index * 60_000),
            updatedAt: new Date(itemsCreatedAt + index * 60_000),
          })),
        ),
      });
      await tx.datasetRuns.deleteMany({
        where: {
          projectId: ctx.projectId,
          datasetId: { in: datasetIds },
          id: { notIn: runIds },
        },
      });
      for (const [index, run] of RUNS.entries()) {
        const data = {
          name: run.name,
          description: run.description,
          datasetId: ids.capitals,
          metadata: {
            model: run.model,
            prompt: `${PROMPT_NAME}-v${run.promptVersion}`,
            ...run.metadata,
          },
          createdAt: new Date(
            today - run.daysAgo * DAY_MS - DAY_MS + 15 * 3_600_000,
          ),
        };
        await tx.datasetRuns.upsert({
          where: {
            id_projectId: { id: runIds[index], projectId: ctx.projectId },
          },
          create: { id: runIds[index], projectId: ctx.projectId, ...data },
          update: data,
        });
      }
      await tx.prompt.deleteMany({
        where: {
          projectId: ctx.projectId,
          name: PROMPT_NAME,
          version: { gt: PROMPT_VERSIONS.length },
        },
      });
      for (const [index, version] of PROMPT_VERSIONS.entries()) {
        const data = {
          prompt: version.text,
          type: "text",
          config: { model: "gpt-4.1", temperature: 0 },
          labels: version.labels,
          tags: ["experiments"],
          commitMessage: version.message,
          createdBy: "API",
          createdAt: new Date(itemsCreatedAt - (3 - index) * DAY_MS),
        };
        await tx.prompt.upsert({
          where: {
            projectId_name_version: {
              projectId: ctx.projectId,
              name: PROMPT_NAME,
              version: index + 1,
            },
          },
          create: {
            id: promptIds[index],
            projectId: ctx.projectId,
            name: PROMPT_NAME,
            version: index + 1,
            ...data,
          },
          update: data,
        });
      }
    });
    const storedPromptIds = await prisma.prompt.findMany({
      where: { projectId: ctx.projectId, name: PROMPT_NAME },
      select: { id: true },
    });
    if (storedPromptIds.some((p) => !promptIds.includes(p.id))) {
      throw new SeedError(
        `${PROMPT_NAME} versions exist with ids this scenario does not own`,
      );
    }

    // Scenes re-run this scenario before every take to reset Postgres state;
    // skip rewriting today's identical ClickHouse rows when they are present.
    const present =
      stale === 0 &&
      (await countRows(
        "events_full",
        "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}",
        { projectId: ctx.projectId, traceIds: allTraceIds },
        "uniqExact(span_id)",
      )) === counts.events &&
      (await countRows(
        "scores",
        "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}",
        { projectId: ctx.projectId, traceIds: experimentTraceIds },
        "uniqExact(id)",
      )) === counts.scores;
    if (present) {
      ctx.log("ClickHouse rows for today already present; skipping writes");
    } else {
      await createTracesCh([trace]);
      await createObservationsCh(observations);
      await createEventsCh([...events, ...chatEvents]);
      await createScoresCh(scores);
    }

    const verified = {
      datasets: await prisma.dataset.count({
        where: { projectId: ctx.projectId, id: { in: datasetIds } },
      }),
      datasetItems: await prisma.datasetItem.count({
        where: { projectId: ctx.projectId, datasetId: { in: datasetIds } },
      }),
      experiments: await countRows(
        "events_full",
        "project_id = {projectId: String} AND experiment_id IN {runIds: Array(String)}",
        { projectId: ctx.projectId, runIds },
        "uniqExact(experiment_id)",
      ),
      promptVersions: await prisma.prompt.count({
        where: { projectId: ctx.projectId, name: PROMPT_NAME },
      }),
      events: await countRows(
        "events_full",
        "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}",
        { projectId: ctx.projectId, traceIds: allTraceIds },
        "uniqExact(span_id)",
      ),
      scores: await countRows(
        "scores",
        "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}",
        { projectId: ctx.projectId, traceIds: experimentTraceIds },
        "uniqExact(id)",
      ),
    };
    for (const [entity, expected] of Object.entries(counts)) {
      const found = verified[entity as keyof typeof verified];
      if (found !== expected) {
        throw new SeedError(
          `Readback mismatch: expected ${expected} ${entity}, found ${found}`,
        );
      }
    }
    return summary(
      ctx,
      startedAt,
      counts,
      verified,
      ids,
      chatTraceId,
      chatTs,
      false,
    );
  },
};
