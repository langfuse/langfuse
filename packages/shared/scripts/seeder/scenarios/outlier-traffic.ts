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
import { GEN_INPUT_PRICE, GEN_OUTPUT_PRICE } from "./payload";
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
 * Long-window traffic with deliberate outliers, built for the outlier chart
 * strip above the trace table (LFE-14451): a diurnal base load spread over
 * the past N days, with deterministic cost / latency / token spikes and a few
 * hour-long latency "incidents" that read as plateaus on the strip.
 *
 * Per trace: root AGENT (its latency spans the trace) + one GENERATION child
 * carrying usage/cost + one TOOL child. Cost lives on the generation, not the
 * root — the shape the strip's root-filter-agnostic aggregation exists for.
 *
 * The outlier recipe is a pure function of the global trace index, so re-runs
 * with the same seed and flags rewrite identical data:
 *  - cost spike   (idx % 89 === 0):   usage ×30 on a premium-rate model
 *  - mega cost    (idx % 979 === 0):  additionally rate ×12 (rare, dominates)
 *  - latency spike(idx % 71 === 3):   generation duration ×35
 *  - token spike  (idx % 113 === 7):  usage ×25 at a discount rate — tokens
 *                                     without a matching cost spike
 *  - incidents:   K deterministic (day, hour) windows where every trace runs
 *                 ×8 slower and every 3rd one ERRORs
 */

const TRACE_NAMES = [
  "checkout-assistant",
  "support-copilot",
  "search-agent",
  "summarize-doc",
  "classify-ticket",
];

const MODELS = [
  "gpt-5.4-mini",
  "claude-haiku-4-5",
  "gemini-3.5-flash-lite",
  "gpt-5.6-sol",
];

const INCIDENT_HOURS = [14, 9, 19];

const usageCost = (
  usageInput: number,
  usageOutput: number,
  rateMultiplier: number,
) => {
  const inputCost = usageInput * GEN_INPUT_PRICE * rateMultiplier;
  const outputCost = usageOutput * GEN_OUTPUT_PRICE * rateMultiplier;
  const usage = {
    input: usageInput,
    output: usageOutput,
    total: usageInput + usageOutput,
  };
  const cost = {
    input: inputCost,
    output: outputCost,
    total: inputCost + outputCost,
  };
  return {
    provided_usage_details: usage,
    usage_details: usage,
    provided_cost_details: cost,
    cost_details: cost,
    total_cost: cost.total,
  };
};

/** Diurnal hour pick: ~15% land in the night hours, the rest in 07:00–22:00. */
const diurnalHour = (seed: number, salt: number): number => {
  const v = jitter(seed, salt, 100);
  return v < 15 ? v % 7 : 7 + (v % 16);
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const days = params["days"] as number;
  const tracesPerDay = params["traces-per-day"] as number;
  const incidents = params["incidents"] as number;
  const withV4 = params["v4"] as boolean;

  if (days < 1 || days > 366) {
    throw new SeedError(
      `--days must be between 1 and 366, got ${days}`,
      "pass the window the chart should cover, e.g. --days 90",
    );
  }
  if (tracesPerDay < 1) {
    throw new SeedError(
      `--traces-per-day must be >= 1, got ${tracesPerDay}`,
      "pass a positive base density, e.g. --traces-per-day 120",
    );
  }
  if (incidents < 0) {
    throw new SeedError(
      `--incidents must be >= 0, got ${incidents}`,
      "pass 0 to seed without incident windows",
    );
  }

  const traceCount = days * tracesPerDay;
  const counts: Record<string, number> = {
    traces: traceCount,
    observations: traceCount * 3,
    events: withV4 ? traceCount * 4 : 0, // synthetic trace span + 3 observations
  };
  const links = [tracesListLink(ctx)];

  if (ctx.dryRun) {
    return {
      scenario: "outlier-traffic",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: Array.from(
        { length: Math.min(traceCount, 5) },
        (_, i) => `${ctx.idPrefix}-d1-t${i}`,
      ),
      sessionIds: [],
      counts,
      verified: {},
      links,
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  // Incident windows: deterministic (day, hour) slots spread over the range.
  const incidentSlots = new Set<string>();
  for (let k = 0; k < incidents; k++) {
    const day = 1 + ((5 + k * 11) % days);
    incidentSlots.add(`${day}:${INCIDENT_HOURS[k % INCIDENT_HOURS.length]}`);
  }

  ctx.log(
    `building ${traceCount} traces over ${days} day(s) (${incidentSlots.size} incident window(s))`,
  );

  const users = Array.from(
    { length: 20 },
    (_, i) => `user-${ctx.idPrefix}-${i}`,
  );
  const dayStartToday = utcDayStartMs();

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const events: EventRecordInsertType[] = [];

  // Start at yesterday (d = 1): today's partial day would place events in the
  // future, hidden by the UI's "past N days" windows.
  for (let d = 1; d <= days; d++) {
    const dayStart = dayStartToday - d * 86_400_000;
    for (let i = 0; i < tracesPerDay; i++) {
      const g = (d - 1) * tracesPerDay + i; // global index drives the recipe
      const traceId = `${ctx.idPrefix}-d${d}-t${i}`;

      const hour = diurnalHour(ctx.seed, g * 7 + 1);
      // jitter() not rng: these land in ClickHouse ORDER BY keys (start_time);
      // see the seeder rules on stream-position randomness.
      const timestamp =
        dayStart + hour * 3_600_000 + jitter(ctx.seed, g * 13 + 2, 3_599_000);

      const isIncident = incidentSlots.has(`${d}:${hour}`);
      const costOutlier = g % 89 === 0;
      const megaCost = g % 979 === 0;
      const latencyOutlier = g % 71 === 3;
      const tokenOutlier = g % 113 === 7;

      const usageScale = costOutlier || megaCost ? 30 : tokenOutlier ? 25 : 1;
      const rateMultiplier = megaCost
        ? 12 * 4
        : costOutlier
          ? 4
          : tokenOutlier
            ? 0.05
            : 1;
      const durationScale = latencyOutlier ? 35 : isIncident ? 8 : 1;

      const usageInput =
        (200 + jitter(ctx.seed, g * 17 + 3, 5000)) * usageScale;
      const usageOutput =
        (100 + jitter(ctx.seed, g * 19 + 4, 2200)) * usageScale;
      const model = costOutlier || megaCost ? "gpt-5.4" : MODELS[g % 4];
      const hasError = isIncident && g % 3 === 0;

      const genStart = timestamp + 40 + jitter(ctx.seed, g * 23 + 5, 200);
      const genDuration =
        (600 + jitter(ctx.seed, g * 29 + 6, 3200)) * durationScale;
      const genEnd = genStart + genDuration;
      const toolStart = genEnd + 20 + jitter(ctx.seed, g * 31 + 7, 100);
      const toolEnd = toolStart + 80 + jitter(ctx.seed, g * 37 + 8, 800);
      const name = TRACE_NAMES[g % TRACE_NAMES.length];

      const trace = createTrace({
        id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        session_id: null,
        timestamp,
        name,
        user_id: users[jitter(ctx.seed, g * 41 + 9, users.length - 1)],
        release: "v2.0.1",
        version: "v2.0.1",
        tags: ["seed", "outlier-traffic"],
        public: false,
        bookmarked: false,
        metadata: { scenario: "outlier-traffic", day: String(d) },
        input: `User request handled by ${name} (#${g})`,
        output: hasError ? "" : `Resolved by ${name} (#${g})`,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      });
      traces.push(trace);

      const emptyUsageCost = {
        provided_usage_details: {},
        usage_details: {},
        provided_cost_details: {},
        cost_details: {},
        total_cost: null,
      };

      const root = createObservation({
        id: `${traceId}-o0`,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: "AGENT",
        parent_observation_id: null,
        name: "handle-request",
        start_time: timestamp,
        end_time: toolEnd,
        completion_start_time: null,
        level: hasError ? "ERROR" : "DEFAULT",
        status_message: hasError ? "Upstream model timeout" : null,
        version: null,
        input: null,
        output: null,
        metadata: { scenario: "outlier-traffic" },
        provided_model_name: null,
        internal_model_id: null,
        model_parameters: "{}",
        ...emptyUsageCost,
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      });

      const generation = createObservation({
        id: `${traceId}-o1`,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: "GENERATION",
        parent_observation_id: `${traceId}-o0`,
        name: "llm-completion",
        start_time: genStart,
        end_time: genEnd,
        completion_start_time:
          genStart + Math.min(300, Math.round(genDuration / 4)),
        level: hasError ? "ERROR" : "DEFAULT",
        status_message: hasError ? "Upstream model timeout" : null,
        version: null,
        input: JSON.stringify({
          messages: [{ role: "user", content: `Request #${g} for ${name}` }],
        }),
        output: hasError ? "" : `Completion for request #${g}`,
        metadata: { scenario: "outlier-traffic" },
        provided_model_name: model,
        internal_model_id: null,
        model_parameters: JSON.stringify({ temperature: 0.2 }),
        ...usageCost(usageInput, usageOutput, rateMultiplier),
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      });

      const tool = createObservation({
        id: `${traceId}-o2`,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: "TOOL",
        parent_observation_id: `${traceId}-o0`,
        name: "persist-result",
        start_time: toolStart,
        end_time: toolEnd,
        completion_start_time: null,
        level: "DEFAULT",
        status_message: null,
        version: null,
        input: null,
        output: null,
        metadata: { scenario: "outlier-traffic" },
        provided_model_name: null,
        internal_model_id: null,
        model_parameters: "{}",
        ...emptyUsageCost,
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      });

      observations.push(root, generation, tool);

      if (withV4) {
        events.push(
          traceToEvent(trace),
          observationToEvent(root, trace),
          observationToEvent(generation, trace),
          observationToEvent(tool, trace),
        );
      }
    }
  }

  ctx.log(
    `inserting ${traces.length} traces, ${observations.length} observations${withV4 ? `, ${events.length} events` : ""}`,
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

  const prefix = `${escapeLike(ctx.idPrefix)}-d%`;
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id LIKE {prefix: String}`,
      { projectId: ctx.projectId, prefix },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      `project_id = {projectId: String} AND id LIKE {prefix: String}`,
      { projectId: ctx.projectId, prefix },
      "uniqExact(id)",
    ),
    ...(withV4
      ? {
          events: await countRows(
            "events_core",
            `project_id = {projectId: String} AND trace_id LIKE {prefix: String} AND is_deleted = 0`,
            { projectId: ctx.projectId, prefix },
            "uniqExact(span_id)",
          ),
        }
      : {}),
  };

  if (verified.traces < counts.traces) {
    throw new SeedError(
      `Readback mismatch: expected ${counts.traces} traces, found ${verified.traces}`,
    );
  }
  if (verified.observations < counts.observations) {
    throw new SeedError(
      `Readback mismatch: expected ${counts.observations} observations, found ${verified.observations}`,
    );
  }
  if (withV4 && (verified.events ?? 0) < counts.events) {
    throw new SeedError(
      `Readback mismatch: expected ${counts.events} events, found ${verified.events}`,
    );
  }

  return {
    scenario: "outlier-traffic",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    // Day 1 only ever holds tracesPerDay traces — never list ids that were
    // not written (a deep link built from one would 404).
    traceIds: Array.from(
      { length: Math.min(tracesPerDay, 5) },
      (_, i) => `${ctx.idPrefix}-d1-t${i}`,
    ),
    sessionIds: [],
    counts,
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const outlierTrafficScenario: ScenarioDefinition = {
  name: "outlier-traffic",
  description:
    "Diurnal base traffic over the past N days with deterministic cost/latency/token outliers and hour-long latency incidents — built for the outlier chart strip above the trace table (LFE-14451). Root AGENT + GENERATION (carries cost) + TOOL per trace.",
  supportsV4: true,
  flags: [
    {
      flag: "days",
      type: "number",
      default: 90,
      description: "spread traffic over the past N days (starting yesterday)",
    },
    {
      flag: "traces-per-day",
      type: "number",
      default: 120,
      description: "base traces per day (3 observations each)",
    },
    {
      flag: "incidents",
      type: "number",
      default: 3,
      description: "hour-long ×8-latency incident windows across the range",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "mirror into v4 events tables (on by default: the outlier strip reads events)",
    },
  ],
  run,
};
