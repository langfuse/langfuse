import {
  createEvent,
  createEventsCh,
  EventRecordInsertType,
} from "../../../src/server";
import { jitter, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, tracesListLink } from "./verify";

// App-shaped child span names, mirroring an application instrumented with its
// own span names that gets re-executed by an SDK experiment run. Chosen to
// exercise `name any of [...]` AND `experimentName any of [...]` together
// (the LFE-10644 filter shape).
const APP_SPAN_NAMES = [
  "handle-chatbot-message",
  "image-generator",
  "sentiment-classifier",
  "agent_session",
] as const;

// The environment both SDKs (JS >= 5, Python >= 3.9) stamp on every
// in-process span of an experiment item run — the root directly, children via
// context propagation. Part of DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS in web.
const SDK_EXPERIMENT_ENVIRONMENT = "sdk-experiment";

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const itemCount = Math.max(1, Number(params.items ?? 20));
  const childrenPerItem = Math.max(1, Number(params["children-per-item"] ?? 2));
  const unenrichedChildren = params["unenriched-children"] === true;
  const runName =
    typeof params["run-name"] === "string" && params["run-name"] !== ""
      ? (params["run-name"] as string)
      : `${ctx.idPrefix}-run`;
  const runId = `${ctx.idPrefix}-run-id`;
  const datasetId = `${ctx.idPrefix}-dataset`;

  // Deterministic time anchor (see rng.ts): start_time lands in the events
  // ORDER BY key, so re-runs with identical flags must produce identical
  // timestamps to overwrite in place.
  const windowMs = 2 * 60 * 60 * 1000;
  const endMs = utcDayStartMs();
  const startMs = endMs - windowMs;
  const stepMs = Math.floor(windowMs / itemCount);

  const eventsFilterLink = `${ctx.baseUrl}/project/${ctx.projectId}/traces?filter=${encodeURIComponent(
    `experimentName;stringOptions;;any of;${runName}`,
  )}`;

  const plannedEvents = itemCount * (1 + childrenPerItem);

  if (ctx.dryRun) {
    return {
      scenario: "experiment-run",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [`${ctx.idPrefix}-t0`],
      sessionIds: [],
      counts: {
        experimentItems: itemCount,
        events: plannedEvents,
        enrichedEvents: unenrichedChildren
          ? itemCount
          : itemCount * (1 + childrenPerItem),
      },
      verified: {},
      links: [tracesListLink(ctx), eventsFilterLink],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const events: EventRecordInsertType[] = [];
  const traceIds: string[] = [];

  for (let i = 0; i < itemCount; i++) {
    const traceId = `${ctx.idPrefix}-t${i}`;
    traceIds.push(traceId);
    const itemId = `${ctx.idPrefix}-item-${i}`;
    const rootSpanId = `${traceId}-root`;
    const itemStartMs = startMs + i * stepMs + jitter(ctx.seed, i, 1000);
    const rootEndMs = itemStartMs + 5_000 + jitter(ctx.seed, i + 1_000, 2000);

    // Experiment fields the SDK sets on the item-run root span itself.
    events.push(
      createEvent({
        project_id: ctx.projectId,
        trace_id: traceId,
        span_id: rootSpanId,
        id: rootSpanId,
        parent_span_id: "",
        name: "experiment-item-run",
        trace_name: "experiment-item-run",
        type: "SPAN",
        environment: SDK_EXPERIMENT_ENVIRONMENT,
        source: "otel",
        input: JSON.stringify({ question: `Seed experiment input ${i}` }),
        output: JSON.stringify({ answer: `Seed experiment output ${i}` }),
        provided_model_name: null,
        model_parameters: "{}",
        provided_usage_details: {},
        usage_details: {},
        provided_cost_details: {},
        cost_details: {},
        metadata_names: ["scenario"],
        metadata_values: ["experiment-run"],
        experiment_id: runId,
        experiment_name: runName,
        experiment_dataset_id: datasetId,
        experiment_item_id: itemId,
        experiment_item_root_span_id: rootSpanId,
        experiment_description: "Seeded SDK experiment run",
        experiment_item_expected_output: JSON.stringify({
          answer: `Expected output ${i}`,
        }),
        start_time: itemStartMs * 1000,
        end_time: rootEndMs * 1000,
        created_at: itemStartMs * 1000,
        updated_at: itemStartMs * 1000,
        event_ts: itemStartMs * 1000,
      }),
    );

    for (let j = 0; j < childrenPerItem; j++) {
      const globalIndex = i * childrenPerItem + j;
      const childSpanId = `${traceId}-c${j}`;
      const childStartMs =
        itemStartMs +
        (j + 1) * 1000 +
        jitter(ctx.seed, globalIndex + 10_000, 500);
      const childEndMs =
        childStartMs + 800 + jitter(ctx.seed, globalIndex + 20_000, 400);
      const isGeneration = j % 2 === 1;

      // Enriched children mirror in-process SDK context propagation: they
      // carry the run/item identifiers (but not description/expected output)
      // AND the sdk-experiment environment. Unenriched children mirror spans
      // joined into the trace from another process via W3C traceparent — the
      // SDK's context propagation cannot reach them, so they arrive with the
      // app's own environment and empty experiment fields.
      const experimentFields = unenrichedChildren
        ? {}
        : {
            environment: SDK_EXPERIMENT_ENVIRONMENT,
            experiment_id: runId,
            experiment_name: runName,
            experiment_dataset_id: datasetId,
            experiment_item_id: itemId,
            experiment_item_root_span_id: rootSpanId,
          };

      events.push(
        createEvent({
          project_id: ctx.projectId,
          trace_id: traceId,
          span_id: childSpanId,
          id: childSpanId,
          parent_span_id: rootSpanId,
          name: APP_SPAN_NAMES[globalIndex % APP_SPAN_NAMES.length],
          trace_name: "experiment-item-run",
          type: isGeneration ? "GENERATION" : "SPAN",
          environment: ctx.environment,
          source: "otel",
          input: JSON.stringify({ step: j, item: i }),
          output: `Seeded child output ${globalIndex}`,
          provided_model_name: isGeneration ? "gpt-4o-mini" : null,
          model_parameters: "{}",
          provided_usage_details: isGeneration
            ? { input: 120, output: 40, total: 160 }
            : {},
          usage_details: isGeneration
            ? { input: 120, output: 40, total: 160 }
            : {},
          provided_cost_details: {},
          cost_details: {},
          metadata_names: ["scenario"],
          metadata_values: ["experiment-run"],
          start_time: childStartMs * 1000,
          end_time: childEndMs * 1000,
          created_at: childStartMs * 1000,
          updated_at: childStartMs * 1000,
          event_ts: childStartMs * 1000,
          ...experimentFields,
        }),
      );
    }
  }

  const counts: Record<string, number> = {
    experimentItems: itemCount,
    events: events.length,
    enrichedEvents: events.filter((e) => e.experiment_id).length,
  };

  ctx.log(
    `writing ${events.length} events (${counts.enrichedEvents} experiment-enriched, run "${runName}")`,
  );
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  // uniqExact(span_id): count() would see pre-merge ReplacingMergeTree
  // duplicates after re-runs with the same id prefix.
  const verified: Record<string, number> = {
    events: await countRows(
      "events_full",
      `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(span_id)",
    ),
    enrichedEvents: await countRows(
      "events_full",
      `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)} AND experiment_name = {runName: String}`,
      { projectId: ctx.projectId, traceIds, runName },
      "uniqExact(span_id)",
    ),
  };

  if (verified.events < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_full rows, found ${verified.events}`,
    );
  }
  if (verified.enrichedEvents < counts.enrichedEvents) {
    throw new SeedError(
      `Readback mismatch: expected ${counts.enrichedEvents} enriched events, found ${verified.enrichedEvents}`,
    );
  }

  return {
    scenario: "experiment-run",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: traceIds.slice(0, 5),
    sessionIds: [],
    counts,
    verified,
    links: [tracesListLink(ctx), eventsFilterLink],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const experimentRunScenario: ScenarioDefinition = {
  name: "experiment-run",
  description:
    "v4 events for one SDK-style experiment run: per item an `experiment-item-run` root (environment `sdk-experiment`, experiment_* fields set) plus app-named child spans (handle-chatbot-message, image-generator, ...). Children are experiment-enriched like in-process SDK propagation by default; --unenriched-children mimics spans joined from another process (empty experiment fields, app environment). For exercising experiment filters vs the hidden-environments default on the events table (LFE-10644). Writes events tables only (no Postgres dataset/run rows).",
  supportsV4: true,
  flags: [
    {
      flag: "items",
      type: "number",
      default: 20,
      description: "number of experiment items (one trace each)",
    },
    {
      flag: "children-per-item",
      type: "number",
      default: 2,
      description: "app-named child spans per item-run root",
    },
    {
      flag: "unenriched-children",
      type: "boolean",
      default: false,
      description:
        "children carry NO experiment fields and the app environment (cross-process shape) instead of enriched + sdk-experiment",
    },
    {
      flag: "run-name",
      type: "string",
      default: "",
      description: "experiment run name (default: <id-prefix>-run)",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "kept for CLI preflight symmetry; this scenario always writes v4 events tables",
    },
  ],
  run,
};
