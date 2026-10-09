import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createEventsCh,
} from "../../../src/server";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, utcDayStartMs } from "./rng";
import { topicEvaluationExamples } from "./topics-evaluation";
import { ScenarioDefinition, SeedError } from "./types";
import { countRows, traceLink, tracesListLink } from "./verify";

// Group labels stay out of trace I/O and metadata: discovery must use the
// requests and responses, not a planted classification.
const DISCOVERY: ReadonlyArray<readonly [string, string]> = [
  [
    "My subscription invoice charged me twice this month. Can you help me get a refund for the duplicate payment?",
    "Compare the two invoice numbers and payment dates. If both charges settled for the same subscription period, contact billing support with those references to request a duplicate-payment refund.",
  ],
  [
    "Where can I download the invoice for my annual subscription? Our accounting team needs the tax details.",
    "Open account settings, then Billing and Invoice history. Download the annual subscription invoice as a PDF; ask billing support to correct missing tax details before submitting it to accounting.",
  ],
  [
    "I canceled my subscription before renewal but another payment appeared. How do I dispute the renewal charge?",
    "Check the cancellation confirmation date against the renewal invoice. Send both to billing support and ask them to review the charge and refund eligibility.",
  ],
  [
    "The company address on our subscription invoice is wrong. Can we correct the billing details and get an updated invoice?",
    "Update the company name and billing address in account settings. Contact billing support with the invoice number to request a corrected invoice for the existing payment.",
  ],
  [
    "I'm visiting Lisbon this weekend. The forecast says rain; how should I adapt my sightseeing itinerary?",
    "Plan museums and covered markets during the rainy hours, keep outdoor viewpoints for a dry interval, and bring a light waterproof jacket. Check an updated local forecast before leaving.",
  ],
  [
    "Help me pack for a three-day trip to Edinburgh with cool temperatures and possible showers.",
    "Pack layers, a waterproof outer jacket, comfortable water-resistant shoes, and a compact umbrella. Keep one indoor activity in each day's travel plan in case showers last longer than expected.",
  ],
  [
    "Our family planned a beach day on holiday, but the weather forecast now shows thunderstorms. What should we do instead?",
    "Move the beach outing to a day without storms. Choose an indoor aquarium or museum today and follow local weather alerts; avoid beaches and exposed outdoor areas during thunderstorms.",
  ],
  [
    "We have one day to explore Copenhagen and expect strong wind and rain. Can you suggest a weather-friendly itinerary?",
    "Start with an indoor museum, have lunch in a covered food hall, and use public transport between stops. Add a short neighborhood walk only if the weather improves.",
  ],
  [
    "My TypeScript API handler throws Cannot read properties of undefined when accessing user.profile.name. How can I debug it?",
    "Inspect the request payload and authentication result before the property access. Validate that user and profile exist, add a test for a missing profile, and return a clear error or fallback instead of dereferencing undefined.",
  ],
  [
    "A Python service fails with KeyError: customer_id when parsing a webhook. How do I fix the exception?",
    "Log the sanitized webhook shape and compare it with the expected schema. Validate required fields before indexing, handle missing customer_id explicitly, and add regression tests for malformed payloads.",
  ],
  [
    "My JavaScript function crashes with data.map is not a function after an API response. Can you help find the bug?",
    "Check whether the response is an array or an object containing an array. Validate the response schema, use the correct nested field, and test unexpected response shapes before calling map.",
  ],
  [
    "Our Python endpoint throws TypeError because a request field is None. What debugging steps should I try?",
    "Trace the field from request parsing to the failing operation. Add input validation for null values, define the intended default or error response, and cover the missing-field case in a regression test.",
  ],
];

const ASSIGNMENT: ReadonlyArray<readonly [string, string]> = [
  [
    "My paid subscription receipt lists the wrong tax number. How can billing support reissue the invoice?",
    "Correct the tax number in billing settings, then send the invoice reference to billing support and request a corrected invoice for the same payment.",
  ],
  [
    "My Node API crashes because order.items is undefined. How should I validate the request and prevent this error?",
    "Validate the order schema before processing it, require items to be an array, and return a useful validation error. Add a regression test for requests that omit items.",
  ],
  [
    "My sourdough loaf is dense and barely rises. How can I improve fermentation and baking?",
    "Check that the starter doubles reliably after feeding, allow enough bulk fermentation time, and use dough expansion rather than the clock alone. Preheat the baking vessel and adjust hydration if the dough is difficult to handle.",
  ],
];

export const topicsScenario: ScenarioDefinition = {
  name: "topics",
  description:
    "Synthetic topic discovery: 12 traces across three semantic themes, plus three separate assignment traces (two familiar requests and one new theme). Use evaluation for 100 varied requests with cross-cutting tool outcomes. No model calls.",
  supportsV4: true,
  flags: [
    {
      flag: "batch",
      type: "string",
      default: "all",
      description: "all, discovery (12), assignment (3), or evaluation (100)",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "also mirror traces/observations into v4 events tables",
    },
  ],
  run: async (ctx, params) => {
    const startedAt = Date.now();
    const batch = String(params.batch ?? "all");
    if (!["all", "discovery", "assignment", "evaluation"].includes(batch)) {
      throw new SeedError(
        "--batch must be all, discovery, assignment, or evaluation",
      );
    }
    const withV4 = params.v4 !== false;
    const evaluation = batch === "evaluation" ? topicEvaluationExamples() : [];
    const examples =
      batch === "evaluation"
        ? evaluation
        : [
            ...DISCOVERY.map((io, index) => ({
              io,
              index,
              batch: "discovery",
            })),
            ...ASSIGNMENT.map((io, index) => ({
              io,
              index: index + DISCOVERY.length,
              batch: "assignment",
            })),
          ].filter((example) => batch === "all" || example.batch === batch);
    const startMs = utcDayStartMs() - 60 * 60 * 1000;
    const timestamps = examples.map(
      ({ index }) => startMs + index * 60000 + jitter(ctx.seed, index, 1000),
    );
    const traceIds = examples.map(
      ({ index }) =>
        `${ctx.idPrefix}-${batch === "evaluation" ? "e" : "t"}${index.toString().padStart(2, "0")}`,
    );
    const counts = {
      traces: examples.length,
      observations: examples.length + evaluation.length,
      events: withV4 ? examples.length * 2 + evaluation.length : 0,
    };
    const summary = {
      scenario: "topics",
      target: "clickhouse" as const,
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds,
      sessionIds: [],
      counts,
      links: [
        tracesListLink(ctx),
        ...traceIds.map((id, index) => traceLink(ctx, id, timestamps[index]!)),
      ],
      dryRun: ctx.dryRun,
    };
    if (ctx.dryRun) {
      return { ...summary, verified: {}, durationMs: Date.now() - startedAt };
    }

    const traces = examples.map(({ io: [input, output], batch }, index) =>
      createTrace({
        id: traceIds[index],
        project_id: ctx.projectId,
        environment: ctx.environment,
        timestamp: timestamps[index],
        name: "assistant-request",
        session_id: null,
        user_id: `${ctx.idPrefix}-user`,
        public: false,
        bookmarked: false,
        tags: ["seed", "topics", batch],
        metadata: { scenario: "topics", batch },
        input: JSON.stringify([{ role: "user", content: input }]),
        output: JSON.stringify([{ role: "assistant", content: output }]),
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
    const tools = evaluation.map((example, index) =>
      createObservation({
        ...generations[index]!,
        id: `${traceIds[index]}-context`,
        type: "TOOL",
        name: "fetch_context",
        parent_observation_id: generations[index]!.id,
        start_time: timestamps[index]! + 100,
        end_time: timestamps[index]! + 250,
        completion_start_time: null,
        input: example.tool.input,
        output: example.tool.output,
        level: example.tool.level,
        status_message: example.tool.status,
      }),
    );
    const observations = generations.concat(tools);
    const events = withV4
      ? traces.flatMap((trace, index) => [
          {
            ...traceToEvent(trace),
            end_time: generations[index]!.updated_at,
          },
          observationToEvent(generations[index]!, trace),
          ...(tools[index] ? [observationToEvent(tools[index]!, trace)] : []),
        ])
      : [];
    ctx.log(
      `writing ${counts.traces} traces (${batch}), ${counts.events} events`,
    );
    await createTracesCh(traces);
    await createObservationsCh(observations);
    if (events.length) await createEventsCh(events);

    const queryParams = { projectId: ctx.projectId, traceIds };
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
      events: withV4
        ? await countRows(
            "events_full",
            "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}",
            queryParams,
            "uniqExact(span_id)",
          )
        : 0,
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
