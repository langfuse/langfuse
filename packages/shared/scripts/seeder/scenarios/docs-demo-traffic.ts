import { prisma } from "../../../src/db";
import {
  createEventsCh,
  createObservation,
  createObservationsCh,
  createScoresCh,
  createTrace,
  createTraceScore,
  createTracesCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
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
import { countRows, escapeLike, tracesListLink } from "./verify";

/**
 * Production-like traffic for the docs-demo "customer-support" product:
 * a month of diurnal, weekday-heavy load across five agent workflows, two
 * environments, several models with real-ish prices, all four levels,
 * `metadata.scenario` values, trace + observation scores, and a few
 * deterministic incidents (traffic bursts, a latency incident with errors, a
 * long-context cost spike). Built for dashboard, Pulse and search-bar docs
 * videos; every row is mirrored into v4 events.
 *
 * Everything is a pure function of (seed, day, index): timestamps anchor on
 * UTC midnight and today only contains hours that have fully elapsed, so a
 * re-run rewrites identical rows (and adds the hours that passed since).
 *
 * `--dashboards` resets what the dashboard videos create in the project:
 * `clean` removes the "Observation Latencies" widget and the "Observation
 * Performance" dashboard; `widget` does that and then recreates the widget.
 */

const DASHBOARD_WIDGET_NAME = "Observation Latencies";
// The editor's auto-generated name, left behind if a take saves before typing.
const DASHBOARD_WIDGET_DEFAULT_NAME = "P 95 Latency by Level (Observations)";
const DASHBOARD_NAME = "Observation Performance";

type Model = { name: string; input: number; output: number };
// USD per token.
const MODELS: Record<string, Model> = {
  mini: { name: "gpt-4.1-mini", input: 0.4e-6, output: 1.6e-6 },
  full: { name: "gpt-4.1", input: 2e-6, output: 8e-6 },
  omni: { name: "gpt-4o", input: 2.5e-6, output: 10e-6 },
  sonnet: { name: "claude-sonnet-4-5", input: 3e-6, output: 15e-6 },
  haiku: { name: "claude-haiku-4-5", input: 1e-6, output: 5e-6 },
};

type Workflow =
  | "support-chat"
  | "order-status"
  | "refund-request"
  | "ticket-triage"
  | "conversation-summary";

// Cumulative workflow mix (out of 100).
const WORKFLOW_MIX: [Workflow, number][] = [
  ["support-chat", 42],
  ["order-status", 62],
  ["refund-request", 74],
  ["ticket-triage", 90],
  ["conversation-summary", 100],
];

const QUESTIONS: Record<Workflow, string[]> = {
  "support-chat": [
    "How do I reset my password?",
    "Can I change the email address on my account?",
    "Do you ship to Canada?",
    "How do I update my payment method?",
    "Is there a student discount?",
    "How do I cancel my subscription?",
    "Can I add a second user to my plan?",
    "Where can I download my invoices?",
  ],
  "order-status": [
    "Where is my order #48213?",
    "My package shows delivered but I can't find it.",
    "When will order #51907 arrive?",
    "Can I change the delivery address for order #50332?",
  ],
  "refund-request": [
    "I was charged twice this month, can I get a refund?",
    "The headphones arrived broken, I want my money back.",
    "Please refund my annual plan, I upgraded by mistake.",
  ],
  "ticket-triage": [
    "App crashes when I open the settings page.",
    "I can't log in since this morning.",
    "Feature request: dark mode for the mobile app.",
    "Invoice shows the wrong company name.",
  ],
  "conversation-summary": [
    "Summarize the conversation with the customer for the ticket.",
  ],
};

const ANSWERS: Record<Workflow, string[]> = {
  "support-chat": [
    "Happy to help! Go to Settings → Security and click 'Reset password'. You'll get an email with a link within a few minutes.",
    "Happy to help. You can change your email under Settings → Profile; we'll send a confirmation to the new address.",
    "Yes, we ship to Canada. Delivery usually takes 4–6 business days.",
    "You can update your card under Billing → Payment methods. The new card is used from your next invoice.",
    "Thanks for asking! Students get 30% off with a valid university email.",
  ],
  "order-status": [
    "Your order is out for delivery today and should arrive by 6 pm.",
    "I'm sorry about that. I've opened a delivery investigation with the carrier and will update you within 24 hours.",
    "Happy to help! Your order shipped yesterday and is expected on Thursday.",
  ],
  "refund-request": [
    "I'm sorry for the trouble. I've issued a refund of $49.00 to your original payment method; it should appear in 3–5 business days.",
    "Happy to help. A prepaid return label is on its way, and the refund is issued as soon as the item is scanned.",
  ],
  "ticket-triage": [
    '{"category": "bug", "priority": "high", "team": "mobile"}',
    '{"category": "account-access", "priority": "urgent", "team": "identity"}',
    '{"category": "feature-request", "priority": "low", "team": "product"}',
    '{"category": "billing", "priority": "medium", "team": "finance"}',
  ],
  "conversation-summary": [
    "Customer reported a duplicate charge. Agent verified two payments and issued a refund. Customer confirmed the issue is resolved.",
    "Customer asked about delivery times to Canada. Agent shared shipping times and a tracking link.",
  ],
};

const TAGS: Record<Workflow, string[]> = {
  "support-chat": ["support", "chat"],
  "order-status": ["support", "orders"],
  "refund-request": ["support", "billing"],
  "ticket-triage": ["triage"],
  "conversation-summary": ["summaries"],
};

const ROOT_TYPES: Record<Workflow, ObservationRecordInsertType["type"]> = {
  "support-chat": "AGENT",
  "order-status": "AGENT",
  "refund-request": "AGENT",
  "ticket-triage": "CHAIN",
  "conversation-summary": "SPAN",
};

const refundOutcome = (
  failed: boolean,
  warned: boolean,
): Pick<ObservationRecordInsertType, "level" | "status_message"> => {
  if (failed) {
    return { level: "ERROR", status_message: "Payment provider returned 503" };
  }
  if (warned) {
    return {
      level: "WARNING",
      status_message: "Refund exceeds auto-approval limit, flagged for review",
    };
  }
  return { level: "DEFAULT", status_message: null };
};

const SENTIMENTS = ["positive", "neutral", "negative"];
const USERS = Array.from({ length: 16 }, (_, i) => `cust-${2041 + i * 37}`);

// Relative traffic per UTC hour: quiet nights, a long business-day plateau.
const HOUR_WEIGHTS = [
  1, 1, 1, 1, 1, 2, 3, 5, 7, 8, 9, 9, 9, 9, 9, 9, 8, 8, 7, 6, 5, 3, 2, 1,
];
const HOUR_TOTAL = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);

/** Deterministic incidents, keyed by days ago. */
const BURSTS: Record<number, { hour: number; extra: number }> = {
  3: { hour: 15, extra: 70 },
  12: { hour: 10, extra: 55 },
  21: { hour: 16, extra: 45 },
};
const LATENCY_INCIDENT = { day: 6, hours: [13, 14] };
const COST_SPIKE = { day: 9, hour: 11, extra: 30 };

/**
 * Inserts are idempotent (deterministic ids and ORDER BY keys), so a batch
 * that hits a transient ClickHouse error (e.g. memory pressure from parallel
 * writers on a shared dev stack) is safe to resend.
 */
const withRetry = async (insert: () => Promise<unknown>) => {
  for (let attempt = 1; ; attempt++) {
    try {
      await insert();
      return;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
};

const hex = (value: number, width: number) =>
  value.toString(16).padStart(width, "0").slice(-width);

function summary(
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
  startedAt: number,
  traces: TraceRecordInsertType[],
  counts: Record<string, number>,
  verified: Record<string, number>,
  links: string[],
  dryRun: boolean,
): SeedSummary {
  return {
    scenario: "docs-demo-traffic",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: traces.slice(0, 5).map((t) => t.id),
    sessionIds: [],
    counts,
    verified,
    links,
    dryRun,
    durationMs: Date.now() - startedAt,
  };
}

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const days = params["days"] as number;
  const tracesPerDay = params["traces-per-day"] as number;
  const dashboards = params["dashboards"] as string;
  if (days < 1 || days > 90) {
    throw new SeedError(`--days must be 1..90, got ${days}`, "e.g. --days 30");
  }
  if (!["keep", "clean", "widget"].includes(dashboards)) {
    throw new SeedError(
      `--dashboards must be keep, clean or widget, got ${dashboards}`,
    );
  }

  const prefix = ctx.idPrefix;
  const now = Date.now();
  const today = utcDayStartMs();
  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const events: EventRecordInsertType[] = [];
  const scores: ScoreRecordInsertType[] = [];

  for (let d = 0; d <= days; d++) {
    const dayStart = today - d * 86_400_000;
    const weekday = new Date(dayStart).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const base = Math.round(
      tracesPerDay *
        (weekend ? 0.55 : 1) *
        (0.85 + jitter(ctx.seed, d, 30) / 100),
    );
    const burst = BURSTS[d];
    const costSpike = d === COST_SPIKE.day ? COST_SPIKE : null;
    const total = base + (burst?.extra ?? 0) + (costSpike?.extra ?? 0);

    for (let i = 0; i < total; i++) {
      const g = d * 10_000 + i;
      const isBurst =
        burst !== undefined && i >= base && i < base + burst.extra;
      const isCostSpike = costSpike !== null && i >= base + (burst?.extra ?? 0);

      let hour: number;
      if (isBurst) {
        hour = burst.hour;
      } else if (isCostSpike) {
        hour = costSpike.hour;
      } else {
        let pick = jitter(ctx.seed, g * 7 + 1, HOUR_TOTAL - 1);
        hour = 0;
        while (pick >= HOUR_WEIGHTS[hour]) {
          pick -= HOUR_WEIGHTS[hour];
          hour++;
        }
      }
      const timestamp =
        dayStart + hour * 3_600_000 + jitter(ctx.seed, g * 13 + 2, 3_540_000);
      // Today only holds hours that have fully elapsed (stable on re-run).
      if (
        timestamp + 120_000 > now ||
        (d === 0 && dayStart + (hour + 1) * 3_600_000 > now)
      ) {
        continue;
      }

      const mixPick = jitter(ctx.seed, g * 11 + 3, 99);
      const workflow: Workflow = isCostSpike
        ? "conversation-summary"
        : WORKFLOW_MIX.find(([, upTo]) => mixPick < upTo)![0];
      const environment =
        jitter(ctx.seed, g * 5 + 4, 99) < 82 ? "production" : "staging";
      const userId = USERS[jitter(ctx.seed, g * 3 + 5, USERS.length - 1)];
      const release = d >= 10 ? "v3.2.0" : "v3.3.0";
      const incident =
        d === LATENCY_INCIDENT.day && LATENCY_INCIDENT.hours.includes(hour);
      const slow = incident ? 6 : 1;
      const failRoll = jitter(ctx.seed, g * 17 + 6, 99);
      const failed = incident ? failRoll < 30 : failRoll < 3;
      const warned = !failed && jitter(ctx.seed, g * 19 + 7, 99) < 6;
      const question =
        QUESTIONS[workflow][
          jitter(ctx.seed, g * 23 + 8, QUESTIONS[workflow].length - 1)
        ];
      const answer =
        ANSWERS[workflow][
          jitter(ctx.seed, g * 29 + 9, ANSWERS[workflow].length - 1)
        ];

      const traceId = [
        prefix,
        hex(d, 2),
        hex(i, 4),
        ...[31, 37, 41].map((salt) =>
          hex(jitter(ctx.seed, g * salt + 10, 0xffffffff), 8),
        ),
      ]
        .join("")
        .slice(0, 32);
      const obsBase = `${prefix}${hex(d, 2)}${hex(i, 4)}`;
      const metadata = {
        scenario: workflow,
        channel: workflow === "ticket-triage" ? "email" : "web-chat",
      };

      const trace = createTrace({
        id: traceId,
        project_id: ctx.projectId,
        environment,
        session_id: null,
        timestamp,
        name: workflow,
        user_id: workflow === "ticket-triage" ? null : userId,
        release,
        version: release,
        tags: TAGS[workflow],
        public: false,
        bookmarked: false,
        metadata,
        input: JSON.stringify({ message: question }),
        output: failed ? "" : JSON.stringify({ reply: answer }),
        created_at: timestamp,
        updated_at: timestamp,
        event_ts: timestamp,
      });
      traces.push(trace);

      // Build the observation tree on a running clock.
      let clock = timestamp + 15 + jitter(ctx.seed, g * 41 + 12, 60);
      let k = 0;
      const rootId = `${obsBase}${hex(k++, 2)}`;
      const children: ObservationRecordInsertType[] = [];
      const step = (
        type: ObservationRecordInsertType["type"],
        name: string,
        durationMs: number,
        extra: Partial<ObservationRecordInsertType> = {},
      ) => {
        const start = clock;
        const end = start + Math.round(durationMs);
        clock = end + 5 + jitter(ctx.seed, g * 43 + k, 40);
        const observation = createObservation({
          id: `${obsBase}${hex(k++, 2)}`,
          trace_id: traceId,
          project_id: ctx.projectId,
          environment,
          type,
          parent_observation_id: rootId,
          name,
          start_time: start,
          end_time: end,
          completion_start_time: null,
          level: "DEFAULT",
          status_message: null,
          version: release,
          input: null,
          output: null,
          metadata: {},
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
          created_at: start,
          updated_at: start,
          event_ts: start,
          ...extra,
        });
        children.push(observation);
        return observation;
      };
      const generation = (
        name: string,
        model: Model,
        inputTokens: number,
        outputTokens: number,
        input: string,
        output: string,
        extra: Partial<ObservationRecordInsertType> = {},
      ) => {
        const latency =
          (350 +
            outputTokens *
              (model.name.includes("mini") || model.name.includes("haiku")
                ? 9
                : 16) +
            jitter(ctx.seed, g * 47 + k, 900)) *
          slow;
        const usage = {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
        };
        const cost = {
          input: inputTokens * model.input,
          output: outputTokens * model.output,
          total: inputTokens * model.input + outputTokens * model.output,
        };
        const obs = step("GENERATION", name, latency, {
          input: JSON.stringify([
            {
              role: "system",
              content: "You are Acme's friendly customer support assistant.",
            },
            { role: "user", content: input },
          ]),
          output: JSON.stringify({ role: "assistant", content: output }),
          provided_model_name: model.name,
          model_parameters: JSON.stringify({
            temperature: 0.3,
            max_tokens: 800,
          }),
          provided_usage_details: usage,
          usage_details: usage,
          provided_cost_details: cost,
          cost_details: cost,
          total_cost: cost.total,
          ...extra,
        });
        obs.completion_start_time = obs.start_time + Math.round(latency * 0.25);
        return obs;
      };
      const tokens = (salt: number, min: number, spread: number) =>
        min + jitter(ctx.seed, g * 53 + salt, spread);

      let reply: ObservationRecordInsertType | null = null;
      if (workflow === "support-chat") {
        step("SPAN", "cache-lookup", 4 + jitter(ctx.seed, g * 59, 12), {
          level: "DEBUG",
          status_message: "cache miss",
        });
        step(
          "RETRIEVER",
          "search-knowledge-base",
          (90 + jitter(ctx.seed, g * 61, 260)) * slow,
          {
            input: JSON.stringify({ query: question, top_k: 5 }),
            output: JSON.stringify({ documents: warned ? 1 : 5 }),
            level: warned ? "WARNING" : "DEFAULT",
            status_message: warned
              ? "Only 1 document above the relevance threshold"
              : null,
          },
        );
        reply = generation(
          "draft-reply",
          jitter(ctx.seed, g * 67, 99) < 65 ? MODELS.mini : MODELS.sonnet,
          tokens(1, 3500, 6500),
          tokens(2, 120, 320),
          question,
          answer,
        );
      } else if (workflow === "order-status") {
        step(
          "TOOL",
          "orders.get-status",
          (120 + jitter(ctx.seed, g * 71, 400)) * slow,
          {
            input: JSON.stringify({
              orderId: question.match(/#(\d+)/)?.[1] ?? "48213",
            }),
            output: failed
              ? null
              : JSON.stringify({ status: "in_transit", carrier: "UPS" }),
            level: failed ? "ERROR" : "DEFAULT",
            status_message: failed ? "Order service timed out after 10s" : null,
          },
        );
        if (!failed) {
          reply = generation(
            "draft-reply",
            MODELS.mini,
            tokens(3, 2200, 3000),
            tokens(4, 80, 200),
            question,
            answer,
          );
        }
      } else if (workflow === "refund-request") {
        step(
          "TOOL",
          "crm.get-customer",
          (80 + jitter(ctx.seed, g * 73, 200)) * slow,
          {
            input: JSON.stringify({ customerId: userId }),
            output: JSON.stringify({ plan: "Pro", tenureMonths: 14 }),
          },
        );
        generation(
          "classify-intent",
          MODELS.haiku,
          tokens(5, 900, 600),
          tokens(6, 10, 20),
          question,
          '{"intent": "refund"}',
        );
        step(
          "TOOL",
          "billing.issue-refund",
          (200 + jitter(ctx.seed, g * 79, 500)) * slow,
          {
            input: JSON.stringify({ customerId: userId, amount: 49 }),
            output: failed
              ? null
              : JSON.stringify({ refundId: `RF-${20931 + i}` }),
            ...refundOutcome(failed, warned),
          },
        );
        if (!failed) {
          reply = generation(
            "draft-reply",
            MODELS.full,
            tokens(7, 4500, 5000),
            tokens(8, 150, 250),
            question,
            answer,
          );
        }
      } else if (workflow === "ticket-triage") {
        reply = generation(
          "classify-ticket",
          MODELS.haiku,
          tokens(9, 800, 900),
          tokens(10, 15, 25),
          question,
          answer,
          {
            level: failed ? "ERROR" : "DEFAULT",
            status_message: failed ? "Rate limit exceeded (429)" : null,
          },
        );
      } else {
        // Long transcripts; the cost spike feeds whole ticket histories.
        reply = generation(
          "summarize",
          isCostSpike ? MODELS.full : MODELS.omni,
          isCostSpike ? tokens(11, 120_000, 60_000) : tokens(11, 7000, 9000),
          tokens(12, 200, 300),
          question,
          answer,
        );
      }
      if (failed && reply) {
        reply.level = "ERROR";
        reply.status_message = reply.status_message ?? "Upstream model timeout";
      }

      const rootType = ROOT_TYPES[workflow];
      const root = createObservation({
        id: rootId,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment,
        type: rootType,
        parent_observation_id: null,
        name: rootType === "AGENT" ? "support-agent" : workflow,
        start_time: timestamp,
        end_time: clock,
        completion_start_time: null,
        level: failed ? "ERROR" : "DEFAULT",
        status_message: failed ? "Workflow failed" : null,
        version: release,
        input: trace.input,
        output: trace.output || null,
        metadata,
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
        created_at: timestamp,
        updated_at: timestamp,
        event_ts: timestamp,
      });
      for (const obs of [root, ...children]) {
        observations.push(obs);
        events.push(observationToEvent(obs, trace));
      }
      events.push(traceToEvent(trace));

      // Scores on most customer-facing traces.
      if (workflow !== "ticket-triage" && jitter(ctx.seed, g * 83, 99) < 65) {
        const helpfulness = failed
          ? 0.1 + jitter(ctx.seed, g * 89, 20) / 100
          : 0.55 + jitter(ctx.seed, g * 97, 45) / 100;
        const scoreBase = {
          project_id: ctx.projectId,
          trace_id: traceId,
          environment,
          source: "EVAL" as const,
          comment: null,
          metadata: {},
          timestamp: clock + 2_000,
          created_at: clock + 2_000,
          updated_at: clock + 2_000,
          event_ts: clock + 2_000,
        };
        scores.push(
          createTraceScore({
            ...scoreBase,
            id: `${traceId}-helpfulness`,
            name: "helpfulness",
            value: Math.round(helpfulness * 100) / 100,
            data_type: "NUMERIC",
          }),
          createTraceScore({
            ...scoreBase,
            id: `${traceId}-resolved`,
            name: "resolved",
            value: failed || helpfulness < 0.7 ? 0 : 1,
            string_value: failed || helpfulness < 0.7 ? "False" : "True",
            data_type: "BOOLEAN",
          }),
          createTraceScore({
            ...scoreBase,
            id: `${traceId}-sentiment`,
            name: "sentiment",
            value: 0,
            string_value: failed
              ? "negative"
              : SENTIMENTS[jitter(ctx.seed, g * 101, 1)],
            data_type: "CATEGORICAL",
            source: "ANNOTATION",
          }),
        );
        if (reply) {
          scores.push(
            createTraceScore({
              ...scoreBase,
              id: `${traceId}-faithfulness`,
              observation_id: reply.id,
              name: "faithfulness",
              value:
                Math.round((0.6 + jitter(ctx.seed, g * 103, 40) / 100) * 100) /
                100,
              data_type: "NUMERIC",
            }),
          );
        }
      }
    }
  }

  const counts = {
    traces: traces.length,
    observations: observations.length,
    events: events.length,
    scores: scores.length,
  };
  const links = [tracesListLink(ctx)];
  if (ctx.dryRun) {
    return summary(ctx, params, startedAt, traces, counts, {}, links, true);
  }

  const like = `${escapeLike(prefix)}%`;
  const where = `project_id = {projectId: String} AND id LIKE {like: String}`;
  const q = { projectId: ctx.projectId, like };
  const readBack = async (): Promise<Record<string, number>> => ({
    traces: await countRows("traces", where, q, "uniqExact(id)"),
    observations: await countRows("observations", where, q, "uniqExact(id)"),
    events: await countRows(
      "events_core",
      `project_id = {projectId: String} AND trace_id LIKE {like: String} AND is_deleted = 0`,
      q,
      "uniqExact(span_id)",
    ),
    scores: await countRows("scores", where, q, "uniqExact(id)"),
  });
  const complete = (found: Record<string, number>) =>
    (Object.keys(counts) as (keyof typeof counts)[]).every(
      (key) => found[key] >= counts[key],
    );
  // Every scene re-runs this scenario; when the deterministic rows are all
  // there already, skip the ~25k-row rewrite (pass --rewrite after changing
  // row contents).
  let verified = await readBack();
  if (params["rewrite"] || !complete(verified)) {
    ctx.log(
      `inserting ${traces.length} traces, ${observations.length} observations, ${events.length} events, ${scores.length} scores`,
    );
    for (const batch of chunk(traces, 1000))
      await withRetry(() => createTracesCh(batch));
    for (const batch of chunk(observations, 1000))
      await withRetry(() => createObservationsCh(batch));
    for (const batch of chunk(events, 500))
      await withRetry(() => createEventsCh(batch));
    for (const batch of chunk(scores, 1000))
      await withRetry(() => createScoresCh(batch));
    verified = await readBack();
  } else {
    ctx.log("all rows already present; skipping inserts (--rewrite forces)");
  }
  for (const key of Object.keys(counts) as (keyof typeof counts)[]) {
    if (verified[key] < counts[key]) {
      throw new SeedError(
        `Readback mismatch: expected ${counts[key]} ${key}, found ${verified[key]}`,
      );
    }
  }

  if (dashboards !== "keep") {
    await prisma.dashboard.deleteMany({
      where: { projectId: ctx.projectId, name: DASHBOARD_NAME },
    });
    await prisma.dashboardWidget.deleteMany({
      where: {
        projectId: ctx.projectId,
        name: { in: [DASHBOARD_WIDGET_NAME, DASHBOARD_WIDGET_DEFAULT_NAME] },
      },
    });
  }
  if (dashboards === "widget") {
    await prisma.dashboardWidget.create({
      data: {
        id: `${ctx.projectId}-observation-latencies`,
        projectId: ctx.projectId,
        name: DASHBOARD_WIDGET_NAME,
        description: "p95 latency by level",
        view: "OBSERVATIONS",
        dimensions: [{ field: "level" }],
        metrics: [{ measure: "latency", agg: "p95" }],
        filters: [],
        chartType: "LINE_TIME_SERIES",
        chartConfig: { type: "LINE_TIME_SERIES" },
        minVersion: 1,
      },
    });
  }

  return summary(
    ctx,
    params,
    startedAt,
    traces,
    counts,
    verified,
    links,
    false,
  );
};

export const docsDemoTrafficScenario: ScenarioDefinition = {
  name: "docs-demo-traffic",
  description:
    "Production-like month of customer-support traffic for docs videos (run with --project docs-demo): diurnal weekday load over five workflows, production + staging, five models with costs, DEFAULT/DEBUG/WARNING/ERROR levels, metadata.scenario, trace/observation scores, bursts, a latency incident and a cost spike; v4 events always. --dashboards clean|widget resets the dashboard videos' widget/dashboard.",
  supportsV4: true,
  flags: [
    {
      flag: "days",
      type: "number",
      default: 30,
      description: "days of history before today (today holds elapsed hours)",
    },
    {
      flag: "traces-per-day",
      type: "number",
      default: 80,
      description: "weekday base traces per day (weekends ~55%)",
    },
    {
      flag: "rewrite",
      type: "boolean",
      default: false,
      description:
        "re-insert all rows even when the readback shows they are present (after changing row contents)",
    },
    {
      flag: "dashboards",
      type: "string",
      default: "keep",
      description:
        "keep | clean (delete the videos' widget + dashboard) | widget (clean, then recreate the 'Observation Latencies' widget)",
    },
  ],
  run,
};
