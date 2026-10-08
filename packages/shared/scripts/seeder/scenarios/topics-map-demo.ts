import { createHash } from "node:crypto";
import { prisma } from "../../../src/db";
import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createEventsCh,
  convertCallsToArrays,
  extractToolsFromObservation,
} from "../../../src/server";
import {
  getTopicRun,
  getLatestFacetSummaries,
  readTopicMapAssignments,
  saveTopicRun,
  writeTopicAssignments,
  writeTopicSummaries,
  TOPICS_TRANSCRIPT_VERSION,
  loadTopicTranscript,
} from "../../../src/server/topics";
import type {
  TopicAssignment,
  TopicDefinition,
  TopicRun,
  TopicSummary,
} from "../../../src/topics";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, utcDayStartMs } from "./rng";
import type { ScenarioContext, SeedSummary } from "./types";
import { SeedError } from "./types";
import { countRows, traceLink } from "./verify";
import { enableTopicsDemoAdmin } from "./topics-demo-access";

type DemoTopic = {
  name: string;
  description: string;
  center: [number, number];
  count: number;
  requests: string[];
  results: string[];
  tool: string;
};

// Nearby families share intent, while each cloud has distinct requests.
// Coordinates are authored fixtures, never an assertion of embedding quality.
const INTENTS: DemoTopic[] = [
  {
    name: "Invoices & billing",
    description:
      "Find invoices, reconcile line items, and correct billing details.",
    center: [-13, -6],
    count: 112,
    requests: [
      "Download the subscription invoice with the correct tax number.",
      "Explain the seat charges on this month's invoice.",
      "Reconcile the annual invoice against the purchase order.",
      "Find a credit note for the seats removed before renewal.",
    ],
    results: [
      "The invoice PDF is available and its tax number matches the billing profile.",
      "The invoice charges eight seats for the complete billing period. The two seats removed before renewal are excluded.",
      "The invoice and purchase order both list eight seats and the same billing period. Their totals agree.",
      "The credit note covers two seats removed before renewal and links to the original invoice.",
    ],
    tool: "retrieve_invoice",
  },
  {
    name: "Refunds & disputes",
    description:
      "Review duplicate charges, canceled renewals, and refund eligibility.",
    center: [-9, -7],
    count: 96,
    requests: [
      "Check whether the two card charges settled against the same invoice.",
      "Refund the renewal charged after the cancellation confirmation.",
      "Find the status of the refund for a duplicate payment.",
      "Review a payment dispute and explain the remaining evidence needed.",
    ],
    results: [
      "Both settled card charges refer to the same invoice and subscription period. One is a duplicate.",
      "The cancellation predates renewal. The refund is confirmed with a settlement reference.",
      "The duplicate-payment refund has settled. The payment record includes its bank settlement reference.",
      "The dispute needs the cancellation confirmation and original invoice. The submitted payment receipt is already recorded.",
    ],
    tool: "review_payment",
  },
  {
    name: "Account access",
    description:
      "Recover sign-in, repair invitations, and explain workspace roles.",
    center: [-12, -1],
    count: 80,
    requests: [
      "Recover access after a single sign-on domain migration.",
      "Check why an invited teammate cannot see the workspace.",
      "Explain which role can manage project API keys.",
      "Find the expired invitation and issue a replacement.",
    ],
    results: [
      "The sign-in profile now uses the migrated domain. The single sign-on test succeeds.",
      "The invitation has expired. A replacement invitation is confirmed with the project member role.",
      "The project owner and administrator roles can manage API keys. The member role cannot.",
      "The expired invitation was found and replaced. Its new delivery and expiry timestamps are confirmed.",
    ],
    tool: "lookup_membership",
  },
  {
    name: "Order tracking",
    description: "Locate delayed shipments and explain delivery updates.",
    center: [-7, -2],
    count: 72,
    requests: [
      "Track a parcel whose delivery date has slipped twice.",
      "Find the latest carrier scan for an order still marked dispatched.",
      "Explain whether a split shipment has a second tracking number.",
      "Check the delivery address before the carrier makes another attempt.",
    ],
    results: [
      "The parcel cleared the sorting center after a weather delay. The carrier's revised delivery date is tomorrow.",
      "The latest scan records arrival at the destination depot. The dispatched status is awaiting the next carrier update.",
      "The order has two parcels with separate tracking numbers. The second parcel is due one day after the first.",
      "The delivery address matches the order confirmation. The carrier recorded another delivery attempt for tomorrow.",
    ],
    tool: "track_shipment",
  },
  {
    name: "API debugging",
    description:
      "Diagnose exceptions, missing fields, and unexpected response shapes.",
    center: [0, 8],
    count: 68,
    requests: [
      "Find why order.items is undefined in the checkout API.",
      "Inspect the webhook traceback for a missing customer_id field.",
      "Repair response validation before calling data.map.",
      "Locate the null profile that reaches the account endpoint.",
    ],
    results: [
      "The request fixture omits order.items. Require an array before calling map and cover the missing-field response in a test.",
      "The traceback indexes customer_id before checking for it. Validate the required field and return a clear missing-field error.",
      "The response is an object containing an items array. Validate that field and map its contents rather than the outer object.",
      "The account fixture has a null profile. Reject or handle null before reading profile.name.",
    ],
    tool: "inspect_traceback",
  },
  {
    name: "Structured extraction",
    description:
      "Convert documents into validated records without losing fields.",
    center: [4, 9],
    count: 64,
    requests: [
      "Extract line items and tax totals from this invoice PDF into JSON.",
      "Validate the contact records against the required schema.",
      "Convert the purchase order into typed fields with missing values listed.",
      "Extract shipment dates without changing the source timezone.",
    ],
    results: [
      "The extracted JSON contains each invoice line item and its tax total, with a source page for every field.",
      "All contact records have the required name and email fields. Two optional phone fields are null.",
      "The purchase order passes the typed schema. The optional delivery contact is missing and is listed separately.",
      "The extracted shipment dates retain their source timezone offsets. No timezone conversion was applied.",
    ],
    tool: "extract_document",
  },
  {
    name: "Documentation answers",
    description:
      "Answer product questions from current documentation and cite the source.",
    center: [-1, 3],
    count: 60,
    requests: [
      "Find the documented rate limit for the batch ingestion endpoint.",
      "Explain the supported authentication methods from the current API guide.",
      "Compare trace retention options using the latest documentation.",
      "Show the documented retry policy and its source section.",
    ],
    results: [
      "The current batch ingestion guide specifies a limit per request and a rate limit per key. The matching sections are attached.",
      "The current API guide lists basic authentication with a public and secret key pair. The authentication section is attached.",
      "The current retention guide lists the supported retention windows and their plan requirements. The comparison cites that guide.",
      "The retry guide recommends backoff for transient failures and no retries for invalid requests. Its source section is attached.",
    ],
    tool: "search_documentation",
  },
  {
    name: "Deployment recovery",
    description:
      "Repair failed rollouts, health checks, and configuration changes.",
    center: [12, -5],
    count: 56,
    requests: [
      "Inspect why the new deployment fails its readiness check.",
      "Find the missing configuration that blocks the worker rollout.",
      "Compare the last healthy release with the failing container logs.",
      "Prepare a rollback plan for the release returning server errors.",
    ],
    results: [
      "The readiness check fails because the worker cannot connect to its queue. The log includes the rejected connection.",
      "The new worker configuration omits the queue URL. The last healthy release contains the required value.",
      "Only the failing release omits the queue URL. The previous release's health check and connection log both succeed.",
      "The rollback plan targets the last healthy release and includes a post-rollback readiness check. No rollback was executed.",
    ],
    tool: "inspect_deployment",
  },
  {
    name: "Integration setup",
    description: "Configure connectors, credentials, and inbound webhooks.",
    center: [9, -1],
    count: 52,
    requests: [
      "Check whether the connector has the scopes required to read records.",
      "Validate the webhook signature configuration before sending test events.",
      "Find why the connected service rejects the access token.",
      "Verify that the callback URL matches the integration settings.",
    ],
    results: [
      "The connector has the required record-read scope. Its current permission check succeeds.",
      "The webhook signature configuration matches the verifier. The signed test event passes validation.",
      "The access token has expired. Reconnecting the service is required before another authenticated request.",
      "The registered callback URL exactly matches the integration settings, including the path and HTTPS scheme.",
    ],
    tool: "validate_connection",
  },
  {
    name: "Retry & queue behavior",
    description:
      "Investigate repeated work, backoff, and tasks waiting in queues.",
    center: [14, 0],
    count: 48,
    requests: [
      "Explain why a failed job re-enters the queue without backoff.",
      "Find the duplicate submission that caused the same task to run twice.",
      "Check whether the retry budget prevents an endless processing loop.",
      "Inspect a queue whose oldest task has stopped making progress.",
    ],
    results: [
      "The retry policy uses an immediate delay because its backoff setting is absent. Configure backoff before another retry.",
      "The same task was submitted with two different idempotency keys. Reuse a stable key to deduplicate those submissions.",
      "The recorded retry budget is three attempts. The job stops after its third failed attempt and cannot loop indefinitely.",
      "The oldest task is waiting on a source timeout. Newer tasks are completing, so the queue itself is still progressing.",
    ],
    tool: "inspect_job_history",
  },
  {
    name: "Search & retrieval",
    description:
      "Find relevant records and separate missing evidence from unsupported answers.",
    center: [-12, 10],
    count: 44,
    requests: [
      "Search the knowledge base for the troubleshooting procedure matching this error.",
      "Find the original policy document rather than a cached excerpt.",
      "Retrieve the current shipping policy and its effective date.",
      "Compare the retrieved source passages before answering the question.",
    ],
    results: [
      "The matching troubleshooting procedure names the same error and recovery step. Its current document reference is attached.",
      "The original policy document was retrieved from the current source. Its cached excerpt was excluded.",
      "The shipping policy's current effective date and source reference are attached. The previous version is marked archived.",
      "Three source passages agree on the answer. The differing archived passage is listed separately with its older effective date.",
    ],
    tool: "retrieve_sources",
  },
  {
    name: "Data analysis",
    description:
      "Aggregate source data, reconcile totals, and report missing rows.",
    center: [-7, 9],
    count: 40,
    requests: [
      "Calculate revenue by region without counting duplicate order rows.",
      "Compare this week's support volume with last week using the source export.",
      "Reconcile the spreadsheet subtotal and list rows missing an invoice date.",
      "Compute conversion rate by channel using the complete source dataset.",
    ],
    results: [
      "Deduplicated order revenue is North 1200 and South 800, for a total of 2000. Duplicate order IDs were excluded.",
      "The source export contains 24 support requests this week and 20 last week, an increase of four requests.",
      "The line items total 2000 and match the spreadsheet subtotal. Two rows with missing invoice dates are listed separately.",
      "The complete dataset shows 20 conversions from 100 visits for Direct and 15 from 100 for Search: 20% and 15%.",
    ],
    tool: "query_dataset",
  },
];

const ISSUES = [
  {
    name: "Upstream timeouts",
    description:
      "A required tool exceeded its deadline and the task stopped before a result.",
    center: [-11, 8],
  },
  {
    name: "Rate limit exhaustion",
    description:
      "Repeated requests exhausted a service limit without a useful retry strategy.",
    center: [-7, 10],
  },
  {
    name: "Permission failures",
    description:
      "The connected account could not read the resource required by the request.",
    center: [-11, -5],
  },
  {
    name: "Expired credentials",
    description: "An expired access token stopped the required source lookup.",
    center: [-7, -7],
  },
  {
    name: "Invalid response shape",
    description:
      "The tool returned a payload that could not be parsed against the expected schema.",
    center: [3, 9],
  },
  {
    name: "Unsupported claims",
    description:
      "The assistant reported a result that contradicted the returned source evidence.",
    center: [7, 6],
  },
  {
    name: "Empty retrieval",
    description:
      "No matching source was returned and the request remained unanswered.",
    center: [0, 0],
  },
  {
    name: "Wrong source version",
    description:
      "The assistant used archived evidence when the request required the current source.",
    center: [5, -1],
  },
  {
    name: "Duplicate actions",
    description:
      "A state-changing tool was called again after its first success and produced duplicate work.",
    center: [12, -5],
  },
  {
    name: "Incomplete pagination",
    description:
      "The assistant treated the first page as the complete result and omitted remaining records.",
    center: [12, 0],
  },
] satisfies { name: string; description: string; center: [number, number] }[];

const ISSUE_CYCLE = [
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  null,
  null,
  null,
  null,
] as const;
const OUTLIERS = [
  "Design a quiet weekend garden using drought-tolerant plants.",
  "Explain why a sourdough starter rises and then collapses.",
  "Plan an indoor rainy-day itinerary for a short city break.",
  "Compare two chord progressions for a piano practice routine.",
];
const REQUEST_CONTEXT = [
  "Use the primary workspace's current source.",
  "Use the sandbox workspace's current source.",
  "Use the European region's current source.",
  "Use the North American region's current source.",
  "Include supporting evidence and list missing fields.",
  "Compare the current source with its prior version.",
];

function coordinates(
  center: [number, number],
  seed: number,
  index: number,
): [number, number] {
  const angle = jitter(seed, index * 2, 6283) / 1000;
  const radius = Math.sqrt(jitter(seed, index * 2 + 1, 10_000) / 10_000);
  return [
    center[0] + Math.cos(angle) * radius * 1.55,
    center[1] + Math.sin(angle) * radius * 1.1,
  ];
}

function embedding(topic: number, seed: number, index: number): number[] {
  const values = Array.from({ length: 256 }, (_, dimension) =>
    dimension === topic
      ? 1
      : (jitter(seed + dimension, index, 1000) / 1000 - 0.5) * 0.005,
  );
  const norm = Math.hypot(...values);
  return values.map((value) => value / norm);
}

function generationTelemetry(input: string, output: string) {
  const inputTokens = Math.ceil(input.length / 4);
  const outputTokens = Math.ceil(output.length / 4);
  const usage = {
    input: inputTokens,
    output: outputTokens,
    total: inputTokens + outputTokens,
  };
  const inputCost = (inputTokens * 0.2) / 1_000_000;
  const outputCost = (outputTokens * 0.8) / 1_000_000;
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
}

function evidence(
  issue: number | null,
  example: { request: string; result: string; tool: string },
) {
  const { result } = example;
  const failures = [
    {
      output: { error: "deadline_exceeded", timeout_ms: 8000 },
      answer:
        "The source lookup timed out. I cannot complete the request without its result.",
      summary:
        "A required source lookup timed out, so the assistant stopped before delivering the requested result.",
    },
    {
      output: {
        error: "rate_limited",
        http_status: 429,
        retry_after_seconds: 60,
        attempts: 5,
      },
      answer:
        "The source remains rate limited after repeated immediate attempts. The request is unfinished.",
      summary:
        "Repeated the source request immediately after rate-limit responses, exhausting the retry budget without completing the task.",
    },
    {
      output: { error: "access_denied", http_status: 403 },
      answer:
        "This account cannot read the required records. Please grant access before retrying.",
      summary:
        "The connected account lacked read permission, blocking the source lookup and leaving the request unfinished.",
    },
    {
      output: { error: "token_expired", http_status: 401 },
      answer:
        "The connector token expired. Reconnect the service so I can finish the source lookup.",
      summary:
        "An expired connector token blocked source access, so the assistant could not complete the requested task.",
    },
    {
      output: {
        received: "<html>upstream error</html>",
        expected: "JSON object",
        error: "decode_failed",
      },
      answer:
        "The source returned HTML where structured records were expected. I could not parse a safe answer.",
      summary:
        "The source returned an invalid response shape, so decoding failed before the assistant could produce a result.",
    },
    {
      output: { result, confirmed_matches: 17 },
      answer:
        "I confirmed 42 matching records and completed all requested actions.",
      summary:
        "Reported 42 matches and claimed completion although the tool confirmed only 17 matches and no completed action.",
    },
    {
      output: { matches: [], total: 0 },
      answer:
        "No matching records were found. Please check the source or provide another reference.",
      summary:
        "The source search returned no matching records, leaving the assistant without evidence needed to answer the request.",
    },
    {
      output: {
        result,
        source_version: "archive",
        requested_version: "current",
      },
      answer: `The current source confirms: ${result}`,
      summary:
        "Answered from an archived source while claiming it was current, so the answer did not meet the requested source version.",
    },
    {
      output: {
        result,
        action_confirmed: true,
        actions_created: 2,
        idempotency_key: null,
      },
      answer:
        "The requested action is complete. I repeated it to make sure the first attempt succeeded.",
      summary:
        "Repeated a confirmed state-changing tool action without an idempotency key, producing two actions instead of one.",
    },
    {
      output: {
        result,
        page: 1,
        records_returned: 17,
        total_records: 64,
        has_next_page: true,
      },
      answer:
        "I checked the complete dataset. There are 17 matching records in total.",
      summary:
        "Stopped after the first page and reported its 17 records as the complete dataset, omitting 47 remaining records.",
    },
  ];
  const interaction =
    issue === null
      ? { output: { result, confirmed: true }, answer: result, summary: "" }
      : failures[issue]!;
  return {
    ...interaction,
    summary:
      issue === null
        ? ""
        : `${example.tool}: ${example.request} ${interaction.summary}`,
  };
}

export async function seedTopicsMapDemo(
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> {
  const startedAt = Date.now();
  const withV4 = params.v4 !== false;
  if (!withV4)
    throw new SeedError(
      "map-demo requires v4 source events so the summary inspector can load its source transcript.",
    );
  const prefix = `topics-demo-${createHash("sha256").update(`${ctx.projectId}:${ctx.idPrefix}:${ctx.seed}`).digest("hex").slice(0, 16)}`;
  const startMs = utcDayStartMs() - 4 * 60 * 60 * 1000;
  const examples = INTENTS.flatMap((topic, topicIndex) =>
    Array.from({ length: topic.count }, (_, position) => ({
      topicIndex,
      position,
      request: `${topic.requests[position % topic.requests.length]} ${REQUEST_CONTEXT[Math.floor(position / topic.requests.length) % REQUEST_CONTEXT.length]}`,
      result: topic.results[position % topic.requests.length]!,
      tool: topic.tool,
    })),
  ).concat(
    Array.from({ length: 24 }, (_, position) => ({
      topicIndex: -1,
      position,
      request: OUTLIERS[position % OUTLIERS.length]!,
      result:
        "I provided a practical explanation with the assumptions stated and no external actions claimed.",
      tool: "retrieve_reference",
    })),
  );
  const issueIndices = examples.map(
    (_, index) =>
      ISSUE_CYCLE[(index * 7 + Math.floor(index / 11)) % ISSUE_CYCLE.length]!,
  );
  const traceIds = examples.map(
    (_, index) => `${ctx.idPrefix}-map-${String(index).padStart(4, "0")}`,
  );
  const timestamps = examples.map(
    (_, index) => startMs + index * 12_000 + jitter(ctx.seed, index, 1000),
  );
  const applicableIssues = issueIndices.filter(
    (issue) => issue !== null,
  ).length;
  const counts = {
    traces: examples.length,
    observations: examples.length * 3,
    events: examples.length * 4,
    topicSummaries: examples.length * 2,
    topicAssignments: examples.length + applicableIssues,
    topicDefinitions: INTENTS.length + ISSUES.length,
    topicMaps: 2,
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
      `${ctx.baseUrl}/project/${ctx.projectId}/topics`,
      ...traceIds
        .slice(0, 3)
        .map((id, index) => traceLink(ctx, id, timestamps[index]!)),
    ],
    dryRun: ctx.dryRun,
  };
  if (ctx.dryRun)
    return { ...summary, verified: {}, durationMs: Date.now() - startedAt };

  try {
    await prisma.topicClusteringRun.count({
      where: { projectId: ctx.projectId },
    });
  } catch {
    throw new SeedError(
      "The Topics map storage is unavailable in Postgres.",
      "pnpm --filter=shared run db:deploy",
    );
  }
  if (
    (await countRows(
      "system.tables",
      "database = currentDatabase() AND name IN ('topics', 'topic_facet_summaries', 'topic_assignments')",
      {},
    )) !== 3
  )
    throw new SeedError(
      "The Topics result tables are missing in ClickHouse.",
      "pnpm --filter=shared run ch:up",
    );
  if (params["demo-admin"] === true) await enableTopicsDemoAdmin(ctx);

  const traces = examples.map((example, index) => {
    const interaction = evidence(issueIndices[index]!, example);
    return createTrace({
      id: traceIds[index],
      project_id: ctx.projectId,
      environment: ctx.environment,
      name: "assistant-request",
      timestamp: timestamps[index],
      session_id: null,
      user_id: `${ctx.idPrefix}-user-${index % 18}`,
      release: null,
      version: null,
      public: false,
      bookmarked: false,
      tags: ["seed", "topics", "map-demo"],
      metadata: { scenario: "topics", batch: "map-demo" },
      input: JSON.stringify([{ role: "user", content: example.request }]),
      output: JSON.stringify([
        { role: "assistant", content: interaction.answer },
      ]),
      created_at: timestamps[index],
      updated_at: timestamps[index]! + 14_000,
      event_ts: timestamps[index]! + 14_000,
    });
  });
  const toolCallMessages = examples.map((example, index) => ({
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: `${traceIds[index]}-call`,
        type: "function",
        function: {
          name: example.tool,
          arguments: JSON.stringify({ request: example.request }),
        },
      },
    ],
  }));
  const generations = traces.map((trace, index) =>
    createObservation({
      id: `${trace.id}-answer`,
      project_id: ctx.projectId,
      trace_id: trace.id,
      environment: ctx.environment,
      type: "GENERATION",
      name: "plan_source_lookup",
      parent_observation_id: null,
      start_time: timestamps[index]! + 50,
      end_time: timestamps[index]! + 90,
      completion_start_time: null,
      input: trace.input,
      output: JSON.stringify(toolCallMessages[index]),
      ...convertCallsToArrays(
        extractToolsFromObservation(trace.input, toolCallMessages[index])
          .toolArguments,
      ),
      created_at: timestamps[index],
      updated_at: timestamps[index]! + 14_000,
      event_ts: timestamps[index]! + 14_000,
      provided_model_name: "synthetic-demo",
      internal_model_id: null,
      model_parameters: "{}",
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      version: null,
      status_message: null,
      level: "DEFAULT",
      metadata: {
        synthetic: "true",
        token_estimate: "characters/4",
        illustrative_input_usd_per_million: "0.2",
        illustrative_output_usd_per_million: "0.8",
      },
      ...generationTelemetry(
        trace.input as string,
        JSON.stringify(toolCallMessages[index]),
      ),
    }),
  );
  const tools = traces.map((trace, index) => {
    const interaction = evidence(issueIndices[index]!, examples[index]!);
    const issue = issueIndices[index];
    const failed = issue !== null && issue !== undefined && issue <= 4;
    return createObservation({
      id: `${trace.id}-source`,
      project_id: ctx.projectId,
      trace_id: trace.id,
      environment: ctx.environment,
      type: "TOOL",
      name: examples[index]!.tool,
      parent_observation_id: generations[index]!.id,
      start_time: timestamps[index]! + 100,
      end_time: timestamps[index]! + (issue === 0 ? 8100 : 700),
      completion_start_time: null,
      input: JSON.stringify({ request: examples[index]!.request }),
      output: JSON.stringify(interaction.output),
      level: failed ? "ERROR" : "DEFAULT",
      status_message: failed ? interaction.summary : null,
      metadata: { toolCallId: `${trace.id}-call`, synthetic: "true" },
      provided_model_name: null,
      internal_model_id: null,
      model_parameters: "{}",
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      version: null,
      provided_usage_details: {},
      usage_details: {},
      provided_cost_details: {},
      cost_details: {},
      total_cost: 0,
      created_at: timestamps[index],
      updated_at: timestamps[index]! + 14_000,
      event_ts: timestamps[index]! + 14_000,
    });
  });
  const answers = traces.map((trace, index) => {
    const input = JSON.stringify([
      { role: "user", content: examples[index]!.request },
      toolCallMessages[index],
      {
        role: "tool",
        tool_call_id: `${trace.id}-call`,
        content: tools[index]!.output,
      },
    ]);
    return createObservation({
      ...generations[index]!,
      id: `${trace.id}-final`,
      name: "answer",
      start_time: timestamps[index]! + 9200,
      end_time: timestamps[index]! + 9800,
      completion_start_time: timestamps[index]! + 9400,
      input,
      output: trace.output,
      ...generationTelemetry(input, trace.output as string),
      tool_calls: [],
      tool_call_names: [],
    });
  });
  ctx.log(
    `writing ${counts.traces} source traces and ${counts.events} v4 events`,
  );
  await createTracesCh(traces);
  await createObservationsCh([...generations, ...tools, ...answers]);
  await createEventsCh(
    traces.flatMap((trace, index) => [
      { ...traceToEvent(trace), end_time: answers[index]!.end_time },
      observationToEvent(generations[index]!, trace),
      observationToEvent(tools[index]!, trace),
      observationToEvent(answers[index]!, trace),
    ]),
  );

  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      "project_id = {projectId: String} AND id IN {traceIds: Array(String)}",
      { projectId: ctx.projectId, traceIds },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}",
      { projectId: ctx.projectId, traceIds },
      "uniqExact(id)",
    ),
    events: await countRows(
      "events_full",
      "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}",
      { projectId: ctx.projectId, traceIds },
      "uniqExact(span_id)",
    ),
    topicSummaries: 0,
    topicAssignments: 0,
    topicDefinitions: 0,
    topicMaps: 0,
  };
  for (const facet of ["intent", "issues"] as const) {
    const facetId = `${prefix}-${facet}`;
    const runId = `${facetId}-map`;
    const topics = facet === "intent" ? INTENTS : ISSUES;
    await prisma.evaluator.upsert({
      where: { id: facetId },
      update: {},
      create: {
        id: facetId,
        projectId: ctx.projectId,
        type: "FACET",
        name: facet === "intent" ? "Intent" : "Issues",
        description:
          facet === "intent"
            ? "Synthetic demo: what the user wanted from the run."
            : "Synthetic demo: the main problem supported by the run's tool evidence.",
        versions: {
          create: {
            version: 1,
            prompt:
              facet === "intent"
                ? "Describe the goal of the user's request as a short imperative verb phrase."
                : "Describe the main problem evidenced by the transcript in one sentence. Return not_applicable when the tool result and response agree.",
          },
        },
      },
    });
    await prisma.topicClusteringRun.upsert({
      where: { id: runId },
      update: {},
      create: {
        id: runId,
        projectId: ctx.projectId,
        facetId,
        facetVersion: 1,
        config: {
          synthetic: true,
          embeddingModel: "synthetic-demo",
          embeddingDimensions: 256,
        },
        createdAt: new Date(startMs),
      },
    });
    const storedRun = await getTopicRun(ctx.projectId, runId);
    if (!storedRun) throw new SeedError("The demo map could not be created.");
    const createdAt = storedRun.createdAt;
    const processedAt = new Date(
      startMs + 4 * 60 * 60 * 1000 - 1000,
    ).toISOString();
    const assignedAt = new Date(Date.parse(processedAt) + 1000).toISOString();
    const summaries: TopicSummary[] = examples.map((example, index) => {
      const issue = issueIndices[index]!;
      const topicIndex = facet === "intent" ? example.topicIndex : issue;
      const isApplicable = facet === "intent" || issue !== null;
      return {
        projectId: ctx.projectId,
        facetId,
        facetVersion: 1,
        traceId: traceIds[index]!,
        sessionId: null,
        triggerType: "manual_poc",
        environment: ctx.environment,
        traceName: "assistant-request",
        unitStartTime: new Date(timestamps[index]!).toISOString(),
        state: isApplicable ? "complete" : "not_applicable",
        summary:
          facet === "intent"
            ? example.request
            : evidence(issue, example).summary,
        embedding: isApplicable
          ? embedding(
              topicIndex === null || topicIndex < 0 ? 255 : topicIndex,
              ctx.seed,
              index,
            )
          : [],
        transcriptId: `${traceIds[index]}-transcript`,
        transcriptVersion: TOPICS_TRANSCRIPT_VERSION,
        summaryModel: "synthetic-demo",
        embeddingModel: "synthetic-demo",
        providedUsageDetails: {},
        usageDetails: {},
        providedCostDetails: {},
        costDetails: {},
        processedAt,
        metadata: { scenario: "topics", batch: "map-demo", synthetic: true },
      };
    });
    const assignments: TopicAssignment[] = summaries.flatMap((row, index) => {
      if (row.state !== "complete") return [];
      const topicIndex =
        facet === "intent" ? examples[index]!.topicIndex : issueIndices[index]!;
      const topic =
        topicIndex !== null && topicIndex >= 0 ? topics[topicIndex] : undefined;
      const centroid = topic ? embedding(topicIndex!, ctx.seed, -1) : null;
      const distance = centroid
        ? 1 -
          row.embedding.reduce(
            (sum, value, dimension) => sum + value * centroid[dimension]!,
            0,
          )
        : null;
      return [
        {
          projectId: ctx.projectId,
          facetId,
          facetVersion: 1,
          traceId: traceIds[index]!,
          sessionId: null,
          environment: ctx.environment,
          traceName: row.traceName,
          unitStartTime: row.unitStartTime,
          summaryProcessedAt: processedAt,
          runId,
          topicId: topic ? `${facetId}-t${topicIndex}` : null,
          topicVersionId: topic ? `${facetId}-t${topicIndex}-v1` : null,
          distance,
          runnerUpDistance: null,
          origin: "initial",
          coordinates: topic
            ? coordinates(topic.center, ctx.seed, index)
            : coordinates([0, -10], ctx.seed, index),
          assignedAt,
        },
      ];
    });
    const definitions: TopicDefinition[] = topics.map((topic, index) => ({
      topicVersionId: `${facetId}-t${index}-v1`,
      projectId: ctx.projectId,
      topicId: `${facetId}-t${index}`,
      createdByRunId: runId,
      createdAt,
      tags: ["synthetic", "map-demo"],
      name: topic.name,
      description: topic.description,
      centroid: embedding(index, ctx.seed, -1),
      radius: 0.01,
      representativeSummaries: assignments
        .filter((assignment) => assignment.topicId === `${facetId}-t${index}`)
        .slice(0, 3)
        .map(({ traceId }) => ({
          facetId,
          facetVersion: 1,
          traceId,
          sessionId: null,
        })),
      metadata: { synthetic: true, projection: "handcrafted-demo" },
    }));
    await writeTopicSummaries(summaries);
    await writeTopicAssignments(assignments);
    const timeRange = {
      from: new Date(startMs),
      to: new Date(startMs + 4 * 60 * 60 * 1000),
    };
    const savedSummaries = (
      await getLatestFacetSummaries(ctx.projectId, facetId, 1, timeRange)
    ).filter((row) => traceIds.includes(row.traceId ?? ""));
    const savedAssignments = await readTopicMapAssignments(
      ctx.projectId,
      { facetId, version: 1 },
      runId,
      timeRange,
    );
    if (
      savedSummaries.length !== summaries.length ||
      savedAssignments.length !== assignments.length ||
      savedAssignments.some(
        (row) =>
          row.coordinates?.length !== 2 ||
          !row.coordinates.every(Number.isFinite),
      )
    )
      throw new SeedError(
        `The ${facet} demo cohort did not read back with complete source summaries and coordinates.`,
      );
    const run: TopicRun = {
      ...storedRun,
      status: "completed",
      startedAt: createdAt,
      finishedAt: assignedAt,
      error: null,
      topics: definitions,
    };
    const savedRun = await saveTopicRun(run);
    verified.topicSummaries! += savedSummaries.length;
    verified.topicAssignments! += savedAssignments.length;
    verified.topicDefinitions! += savedRun.topics.length;
    verified.topicMaps! += savedRun.status === "completed" ? 1 : 0;
    ctx.log(
      `published ${facet}: ${savedRun.topics.length} topics, ${savedAssignments.length} positioned traces`,
    );
  }
  for (const [entity, expected] of Object.entries(counts))
    if (verified[entity] !== expected)
      throw new SeedError(
        `Readback mismatch: expected ${expected} ${entity}, found ${verified[entity]}`,
      );
  const source = await loadTopicTranscript({
    projectId: ctx.projectId,
    traceId: traceIds[0]!,
  });
  if (
    source.unitStartTime !== new Date(timestamps[0]!).toISOString() ||
    !JSON.stringify(source.transcript).includes("deadline_exceeded")
  )
    throw new SeedError(
      "The Topics demo source transcript did not retain its declared tool result.",
    );
  return { ...summary, verified, durationMs: Date.now() - startedAt };
}
