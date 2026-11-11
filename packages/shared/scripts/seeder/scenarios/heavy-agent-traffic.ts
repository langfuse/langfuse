import { prisma } from "../../../src/db";
import { clickhouseClient } from "../../../src/server";
import { utcDayStartMs } from "./rng";
import {
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, escapeLike, tracesListLink } from "./verify";

/**
 * Bulk v4 agent traffic with very large tool payloads, built for events/traces
 * list performance work on big projects. Every trace is a root AGENT followed
 * by repeating turns of GENERATION -> TOOL -> TOOL -> SPAN. Each GENERATION
 * declares the agent's whole tool set (hundreds of JSON schemas in
 * `tool_definitions`) and carries a large `tool_calls` array and chat-history
 * input, the shape that MCP-heavy agent frameworks send on every LLM call.
 *
 * Rows are generated inside ClickHouse (`INSERT ... SELECT FROM numbers()`)
 * straight into events_full; events_core fills through events_core_mv. Every
 * value is a pure function of (seed, trace index, observation index), so
 * re-runs on the same UTC day overwrite in place.
 *
 * Selectivity knobs for filter benchmarks (fractions of traces):
 *  - trace name `billing-escalation-agent`: 0.5%
 *  - tag `vip`: 1%
 *  - metadata `customer.plan` = `enterprise`: 2%
 *  - trace score `helpfulness` >= 0.99: ~0.8% (40% of traces have the score)
 *  - level ERROR: ~0.3% of observations
 */

const AGENT_NAMES = [
  "support-agent",
  "coding-agent",
  "research-agent",
  "sales-assistant",
  "ops-copilot",
];
const RARE_AGENT_NAME = "billing-escalation-agent";
const MODELS = [
  "gpt-5.4",
  "claude-sonnet-4-5",
  "gpt-5.4-mini",
  "gemini-3.5-pro",
];
const SPAN_NAMES = [
  "plan-step",
  "retrieve-context",
  "rerank",
  "guardrail-check",
  "summarize-memory",
];
const TOOL_VERBS = [
  "search",
  "get",
  "list",
  "create",
  "update",
  "delete",
  "run",
  "query",
  "send",
  "fetch",
];
const TOOL_NOUNS = [
  "issue",
  "ticket",
  "user",
  "document",
  "file",
  "repository",
  "calendar_event",
  "email",
  "invoice",
  "order",
  "deployment",
  "dashboard",
];
const PARAM_NAMES = [
  "query",
  "limit",
  "cursor",
  "workspace_id",
  "filters",
  "sort_by",
  "include_archived",
  "fields",
  "owner",
  "since",
  "until",
  "labels",
];
// Shared vocabulary for descriptions and payload text: tool schemas reuse it,
// like real ones do, so compression behaves like production payloads. No
// quotes or backslashes: the fragments are spliced into JSON strings.
const SENTENCES = [
  "Use this tool when the user asks for information that lives in the workspace.",
  "Returns a paginated list of matching records ordered by relevance.",
  "The caller must pass a workspace identifier obtained from a previous call.",
  "Results include the record id, title, owner, timestamps and a short excerpt.",
  "Prefer narrow filters; broad queries are slow and may be truncated.",
  "Fails with a permission error when the token lacks the required scope.",
  "Dates are ISO 8601 strings in UTC; relative dates are not supported.",
  "Set include_archived to true to also search archived records.",
  "Large responses are summarized; request specific fields to avoid truncation.",
  "Rate limited to sixty calls per minute per workspace.",
  "Idempotent: repeating the same request returns the same result.",
  "Writes are applied immediately and cannot be undone through this tool.",
  "Pass a cursor from the previous page to continue a listing.",
  "Labels are matched case-insensitively and combined with a logical AND.",
  "The owner can be an email address or a user id.",
  "Use the fields parameter to limit the payload to the attributes you need.",
  "When the record does not exist the tool returns an empty result.",
  "Escalate to a human when the request involves refunds above the threshold.",
  "Always confirm destructive actions with the user before calling this tool.",
  "The response contains a next_cursor field when more results are available.",
  "Sorting by updated time returns the most recently changed records first.",
  "Attachments are returned as signed URLs that expire after fifteen minutes.",
  "Filters support equality, prefix and range operators on indexed fields.",
  "Text search uses stemming and ignores punctuation and casing.",
  "The tool enforces the same access rules as the web application.",
  "Invoices are immutable once issued; create a credit note to correct them.",
  "Deployments are rolled out progressively and can be paused at any time.",
  "Calendar events are returned in the organizer timezone.",
  "Email bodies are returned as plain text with quoted replies removed.",
  "Repository paths are relative to the default branch root.",
  "Tickets inherit the priority of the customer plan unless overridden.",
  "Dashboards are refreshed every five minutes from the warehouse.",
  "The assistant should cite the record ids it used in the final answer.",
  "Prefer the search tool over list when the user gives keywords.",
  "Combine multiple filters to narrow the result set before paginating.",
  "Unknown fields in the request are ignored without an error.",
  "A timeout is returned when the upstream system does not answer in time.",
  "Retry with exponential backoff when the tool reports a transient error.",
  "Results are cached for thirty seconds per identical request.",
  "Responses larger than one megabyte are rejected by the gateway.",
  "The customer asked to change the delivery address on the latest order.",
  "I looked up the account and found three open tickets for this customer.",
  "The deployment failed health checks in two regions and was rolled back.",
  "Here is a summary of the relevant documents with their identifiers.",
  "The invoice total does not match the order because of a partial refund.",
  "I need the latest status of the escalation before replying to the user.",
  "The search returned no results; broadening the date range might help.",
  "The user prefers concise answers with links to the source records.",
  "Two calendar events overlap on Thursday afternoon for the same owner.",
  "The repository contains a migration that was never applied in staging.",
  "Please draft a reply that acknowledges the delay and offers a credit.",
  "The previous tool call failed because the cursor had expired.",
  "According to the policy, enterprise customers get a dedicated contact.",
  "The dashboard shows a spike in error rates after the last release.",
  "I will call the ticket tool again with a narrower filter.",
  "The order was shipped yesterday and should arrive within two days.",
  "The document mentions a contractual limit of ten seats per workspace.",
  "Next, I will verify the user permissions before updating the record.",
  "The email thread contains a request to cancel the subscription.",
  "Summarizing the findings for the user with the most relevant details.",
  "The refund exceeds the automatic approval threshold for this plan.",
  "The query matched forty records; showing the first twenty.",
  "Context retrieved from the knowledge base for the current question.",
  "The plan step completed; continuing with the next tool call.",
];

/** Non-negative 32-bit salt for the ClickHouse hashes. */
const seedSalt = (seed: number): number =>
  Math.abs(Math.trunc(seed)) % 4_294_967_296;

const sqlString = (value: string): string =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
const sqlStringArray = (values: readonly string[]): string =>
  `[${values.map(sqlString).join(", ")}]`;

/** JSON text fragment of `count` vocabulary sentences picked by `saltExpr`. */
const textSql = (saltExpr: string, count: number): string =>
  `arrayStringConcat(arrayMap(i -> arrayElement(${sqlStringArray(SENTENCES)}, 1 + xxHash32(concat(${saltExpr}, '#', toString(i))) % ${SENTENCES.length}), range(${Math.max(1, count)})), ' ')`;

/** Number of vocabulary sentences that roughly fill `bytes` of text. */
const sentencesFor = (bytes: number): number => {
  const averageLength =
    SENTENCES.reduce((sum, sentence) => sum + sentence.length + 1, 0) /
    SENTENCES.length;
  return Math.max(1, Math.round(bytes / averageLength));
};

const toolNameSql = (indexExpr: string): string =>
  `concat(arrayElement(${sqlStringArray(TOOL_VERBS)}, 1 + (${indexExpr}) % ${TOOL_VERBS.length}), '_', arrayElement(${sqlStringArray(TOOL_NOUNS)}, 1 + intDiv(${indexExpr}, ${TOOL_VERBS.length}) % ${TOOL_NOUNS.length}), '_', toString(${indexExpr}))`;

/**
 * One `tool_definitions` value in the ingestion shape
 * (`{"description": ..., "parameters": "<JSON schema as a string>"}`, see
 * normalized-io/projections/tool-call-columns.ts), about `bytes` long.
 */
const toolDefinitionSql = (nameExpr: string, bytes: number): string => {
  const propertyCount = Math.max(
    1,
    Math.min(PARAM_NAMES.length, Math.round(bytes / 300)),
  );
  const propertySentences = sentencesFor(bytes * 0.09);
  const descriptionSentences = sentencesFor(bytes * 0.22);
  const properties = PARAM_NAMES.slice(0, propertyCount)
    .map(
      (param) =>
        `concat(${sqlString(`\\"${param}\\":{\\"type\\":\\"string\\",\\"description\\":\\"`)}, ${textSql(`concat(${nameExpr}, ${sqlString(param)})`, propertySentences)}, ${sqlString('\\"}')})`,
    )
    .join(`, ',', `);
  return `concat(${sqlString('{"description":"')}, ${textSql(nameExpr, descriptionSentences)}, ${sqlString('","parameters":"{\\"type\\":\\"object\\",\\"properties\\":{')}, ${properties}, ${sqlString('},\\"required\\":[\\"query\\"]}"}')})`;
};

/** One `tool_calls` element in the ingestion shape. */
const toolCallSql = (
  callIndexExpr: string,
  rowSaltExpr: string,
  bytes: number,
): string =>
  `concat(${sqlString('{"id":"call_')}, lower(hex(xxHash64(concat(${rowSaltExpr}, '-call-', toString(${callIndexExpr}))))), ${sqlString('","arguments":"{\\"query\\":\\"')}, ${textSql(`concat(${rowSaltExpr}, '-args-', toString(${callIndexExpr}))`, sentencesFor(bytes))}, ${sqlString('\\",\\"limit\\":')}, toString(5 + ${callIndexExpr}), ${sqlString('}","type":"function","index":')}, toString(${callIndexExpr}), '}')`;

type HeavyAgentParams = {
  projectId: string;
  environment: string;
  idPrefix: string;
  seed: number;
  traces: number;
  observationsPerTrace: number;
  days: number;
  tools: number;
  toolSchemaBytes: number;
  toolCalls: number;
  toolCallBytes: number;
  inputBytes: number;
  outputBytes: number;
  metadataKeys: number;
  metadataValueBytes: number;
  anchorMs: number;
};

const OBSERVATION_STEP_MS = 1_500;

/**
 * Trace-level row variables shared by the events and scores inserts. `t` is
 * the trace index; `h` its hash, which drives every per-trace attribute.
 */
const traceVariablesSql = (p: HeavyAgentParams): string => {
  const spreadMs = p.days * 86_400_000;
  return `
    xxHash32(toUInt64(t) * 7919 + ${seedSalt(p.seed)}) AS h,
    concat(${sqlString(p.idPrefix)}, '-t', toString(t)) AS trace_id_v,
    toInt64(${p.anchorMs}) - toInt64(intDiv((t + 1) * ${spreadMs}, ${p.traces})) + toInt64(h % ${Math.max(1, Math.floor(spreadMs / p.traces))}) AS trace_start_ms`;
};

const buildEventsInsertSql = (
  p: HeavyAgentParams,
  firstTrace: number,
  traceCount: number,
): string => {
  const opt = p.observationsPerTrace;
  const metadataNames = [
    "agent.version",
    "customer.id",
    "customer.plan",
    "framework",
    "region",
    "request.id",
    "retrieval.context",
    ...Array.from(
      { length: Math.max(0, p.metadataKeys - 7) },
      (_, i) => `attr.${String(i).padStart(2, "0")}`,
    ),
  ]
    .slice(0, Math.max(1, p.metadataKeys))
    .sort();
  const metadataValueSql = (name: string): string => {
    switch (name) {
      case "agent.version":
        return `concat('2.', toString(h % 7), '.0')`;
      case "customer.id":
        return `concat('cust-', toString(h % 1500))`;
      case "customer.plan":
        return `multiIf(h % 50 = 0, 'enterprise', h % 10 < 3, 'pro', 'free')`;
      case "framework":
        return `arrayElement(['langgraph', 'openai-agents', 'pydantic-ai', 'mastra'], 1 + h % 4)`;
      case "region":
        return `arrayElement(['eu-central-1', 'us-east-1', 'ap-south-1'], 1 + h % 3)`;
      case "request.id":
        return `lower(hex(xxHash64(concat(span_id_v, '-req'))))`;
      case "retrieval.context":
        return `if(type_v = 'GENERATION', ${textSql("concat(span_id_v, '-ctx')", sentencesFor(p.metadataValueBytes))}, '')`;
      default:
        return `toString(xxHash32(concat(span_id_v, ${sqlString(name)})) % 1000)`;
    }
  };
  const toolsForAgent = `toUInt32(greatest(1, intDiv(${p.tools} * (3 + h % 5), 5)))`;
  const generationInputSql = `concat('{"messages":[', arrayStringConcat(arrayMap(m -> concat('{"role":"', if(m % 2 = 0, 'user', 'assistant'), '","content":"', ${textSql("concat(span_id_v, '-in-', toString(m))", sentencesFor(p.inputBytes / 8))}, '"}'), range(8)), ','), ']}')`;

  return `
    INSERT INTO events_full (
      project_id, trace_id, span_id, parent_span_id, start_time, end_time,
      name, type, environment, version, release, trace_name, user_id,
      session_id, tags, level, status_message, completion_start_time,
      is_app_root, bookmarked, public, prompt_id, prompt_name, prompt_version,
      model_id, provided_model_name, model_parameters, provided_usage_details,
      usage_details, provided_cost_details, cost_details,
      usage_pricing_tier_id, usage_pricing_tier_name, tool_definitions,
      tool_calls, tool_call_names, input, output, metadata_names,
      metadata_values, experiment_id, experiment_name,
      experiment_metadata_names, experiment_metadata_values,
      experiment_description, experiment_dataset_id, experiment_item_id,
      experiment_item_version, experiment_item_expected_output,
      experiment_item_metadata_names, experiment_item_metadata_values,
      experiment_item_root_span_id, source, service_name, service_version,
      scope_name, scope_version, telemetry_sdk_language, telemetry_sdk_name,
      telemetry_sdk_version, blob_storage_file_path, created_at, updated_at,
      event_ts, is_deleted, ingestion_api_key, ingestion_sdk_name,
      ingestion_sdk_version
    )
    SELECT
      ${sqlString(p.projectId)} AS project_id,
      trace_id_v AS trace_id,
      span_id_v AS span_id,
      multiIf(
        k = 0, '',
        turn_pos IN (1, 2), concat(trace_id_v, '-o', toString(k - turn_pos)),
        concat(trace_id_v, '-o0')
      ) AS parent_span_id,
      fromUnixTimestamp64Milli(start_ms, 'UTC') AS start_time,
      fromUnixTimestamp64Milli(start_ms + duration_ms, 'UTC') AS end_time,
      multiIf(
        k = 0, agent_name,
        type_v = 'GENERATION', concat('llm-call ', model_v),
        type_v = 'TOOL', ${toolNameSql(`toUInt32(intDiv(hk, 16) % ${toolsForAgent})`)},
        arrayElement(${sqlStringArray(SPAN_NAMES)}, 1 + hk % ${SPAN_NAMES.length})
      ) AS name,
      type_v AS type,
      ${sqlString(p.environment)} AS environment,
      concat('2.', toString(h % 7), '.0') AS version,
      concat('v1.42.', toString(h % 3)) AS release,
      agent_name AS trace_name,
      concat('user-', toString(h % 5000)) AS user_id,
      concat(${sqlString(p.idPrefix)}, '-s', toString(intDiv(t, 8))) AS session_id,
      arrayConcat(['agent', 'heavy-tools'], if(h % 100 = 0, ['vip'], [])) AS tags,
      level_v AS level,
      if(level_v = 'ERROR', concat('Tool execution failed: upstream returned 502 for request ', lower(hex(xxHash64(span_id_v)))), '') AS status_message,
      if(type_v = 'GENERATION', fromUnixTimestamp64Milli(start_ms + 150 + hk % 900, 'UTC'), NULL) AS completion_start_time,
      false AS is_app_root,
      false AS bookmarked,
      false AS public,
      '' AS prompt_id,
      '' AS prompt_name,
      NULL AS prompt_version,
      '' AS model_id,
      if(type_v = 'GENERATION', model_v, '') AS provided_model_name,
      if(type_v = 'GENERATION', '{"temperature":0.2,"max_tokens":4096,"tool_choice":"auto"}', '{}') AS model_parameters,
      if(type_v = 'GENERATION', map('input', usage_in, 'output', usage_out, 'total', usage_in + usage_out), map()) AS provided_usage_details,
      if(type_v = 'GENERATION', map('input', usage_in, 'output', usage_out, 'total', usage_in + usage_out), map()) AS usage_details,
      if(type_v = 'GENERATION', map('input', toDecimal128(usage_in * 0.0000025, 12), 'output', toDecimal128(usage_out * 0.00001, 12), 'total', toDecimal128(usage_in * 0.0000025 + usage_out * 0.00001, 12)), map()) AS provided_cost_details,
      if(type_v = 'GENERATION', map('input', toDecimal128(usage_in * 0.0000025, 12), 'output', toDecimal128(usage_out * 0.00001, 12), 'total', toDecimal128(usage_in * 0.0000025 + usage_out * 0.00001, 12)), map()) AS cost_details,
      NULL AS usage_pricing_tier_id,
      NULL AS usage_pricing_tier_name,
      if(type_v = 'GENERATION',
        mapFromArrays(
          arrayMap(j -> ${toolNameSql("j")}, range(${toolsForAgent})),
          arrayMap(j -> ${toolDefinitionSql(toolNameSql("j"), p.toolSchemaBytes)}, range(${toolsForAgent}))
        ),
        map()
      ) AS tool_definitions,
      if(type_v = 'GENERATION',
        arrayMap(c -> ${toolCallSql("c", "span_id_v", p.toolCallBytes)}, range(call_count)),
        []
      ) AS tool_calls,
      if(type_v = 'GENERATION',
        arrayMap(c -> ${toolNameSql(`toUInt32((hk + c * 7) % ${toolsForAgent})`)}, range(call_count)),
        []
      ) AS tool_call_names,
      multiIf(
        k = 0, concat('{"role":"user","content":"', ${textSql("concat(trace_id_v, '-ask')", 6)}, '"}'),
        type_v = 'GENERATION', ${generationInputSql},
        type_v = 'TOOL', concat('{"query":"', ${textSql("concat(span_id_v, '-toolin')", 6)}, '","limit":20}'),
        concat('{"step":', toString(k), '}')
      ) AS input,
      multiIf(
        k = 0, concat('{"role":"assistant","content":"', ${textSql("concat(trace_id_v, '-answer')", 14)}, '"}'),
        type_v = 'GENERATION', concat('{"role":"assistant","content":"', ${textSql("concat(span_id_v, '-out')", sentencesFor(p.outputBytes))}, '"}'),
        type_v = 'TOOL', concat('{"results":[', arrayStringConcat(arrayMap(r -> concat('{"id":"rec-', toString(r), '","excerpt":"', ${textSql("concat(span_id_v, '-res-', toString(r))", 3)}, '"}'), range(8)), ','), ']}'),
        '{"ok":true}'
      ) AS output,
      ${sqlStringArray(metadataNames)} AS metadata_names,
      [${metadataNames.map(metadataValueSql).join(", ")}] AS metadata_values,
      '' AS experiment_id,
      '' AS experiment_name,
      [] AS experiment_metadata_names,
      [] AS experiment_metadata_values,
      '' AS experiment_description,
      '' AS experiment_dataset_id,
      '' AS experiment_item_id,
      NULL AS experiment_item_version,
      '' AS experiment_item_expected_output,
      [] AS experiment_item_metadata_names,
      [] AS experiment_item_metadata_values,
      '' AS experiment_item_root_span_id,
      'otel' AS source,
      'agent-service' AS service_name,
      '2.4.0' AS service_version,
      'langfuse-sdk' AS scope_name,
      '3.10.0' AS scope_version,
      'python' AS telemetry_sdk_language,
      'opentelemetry' AS telemetry_sdk_name,
      '1.38.0' AS telemetry_sdk_version,
      '' AS blob_storage_file_path,
      fromUnixTimestamp64Milli(start_ms + duration_ms + 1000, 'UTC') AS created_at,
      fromUnixTimestamp64Milli(start_ms + duration_ms + 1000, 'UTC') AS updated_at,
      fromUnixTimestamp64Milli(start_ms + duration_ms + 2000, 'UTC') AS event_ts,
      0 AS is_deleted,
      'pk-lf-seed-heavy-agent' AS ingestion_api_key,
      'langfuse-python' AS ingestion_sdk_name,
      '3.10.0' AS ingestion_sdk_version
    FROM (
      SELECT
        *,
        multiIf(k = 0, 'AGENT', turn_pos = 0, 'GENERATION', turn_pos IN (1, 2), 'TOOL', 'SPAN') AS type_v,
        concat(trace_id_v, '-o', toString(k)) AS span_id_v,
        trace_start_ms + toInt64(k) * ${OBSERVATION_STEP_MS} + toInt64(hk % 400) AS start_ms,
        toInt64(multiIf(
          k = 0, ${opt * OBSERVATION_STEP_MS + 2_000},
          type_v = 'GENERATION', 800 + hk % 6000,
          type_v = 'TOOL', 50 + hk % 2000,
          5 + hk % 300
        )) AS duration_ms,
        if(h % 200 = 0, ${sqlString(RARE_AGENT_NAME)}, arrayElement(${sqlStringArray(AGENT_NAMES)}, 1 + h % ${AGENT_NAMES.length})) AS agent_name,
        arrayElement(${sqlStringArray(MODELS)}, 1 + intDiv(h, 8) % ${MODELS.length}) AS model_v,
        multiIf(hk % 1000 < 3, 'ERROR', hk % 1000 < 15, 'WARNING', 'DEFAULT') AS level_v,
        toUInt64(2000 + hk % 60000) AS usage_in,
        toUInt64(100 + intDiv(hk, 256) % 3000) AS usage_out,
        toUInt32(greatest(1, ${p.toolCalls} - 2 + intDiv(hk, 4096) % 5)) AS call_count
      FROM (
        SELECT
          intDiv(number, ${opt}) AS t,
          number % ${opt} AS k,
          if(k = 0, 0, (k - 1) % 4) AS turn_pos,
          xxHash32(toUInt64(number) * 104729 + ${seedSalt(p.seed)}) AS hk,
          ${traceVariablesSql(p)}
        FROM numbers(${firstTrace * opt}, ${traceCount * opt})
      )
    )
  `;
};

const buildScoresInsertSql = (p: HeavyAgentParams): string => `
    INSERT INTO scores (
      id, timestamp, project_id, environment, trace_id, observation_id, name,
      value, source, comment, metadata, data_type, string_value, created_at,
      updated_at, event_ts, is_deleted
    )
    SELECT
      concat(trace_id_v, '-score-', score_name) AS id,
      fromUnixTimestamp64Milli(trace_start_ms + ${p.observationsPerTrace * OBSERVATION_STEP_MS + 5_000}, 'UTC') AS timestamp,
      ${sqlString(p.projectId)} AS project_id,
      ${sqlString(p.environment)} AS environment,
      trace_id_v AS trace_id,
      NULL AS observation_id,
      score_name AS name,
      if(score_name = 'helpfulness', (h % 101) / 100, toFloat64(intDiv(h, 256) % 3)) AS value,
      'API' AS source,
      NULL AS comment,
      map() AS metadata,
      if(score_name = 'helpfulness', 'NUMERIC', 'CATEGORICAL') AS data_type,
      if(score_name = 'helpfulness', NULL, arrayElement(['resolved', 'escalated', 'abandoned'], 1 + intDiv(h, 256) % 3)) AS string_value,
      timestamp AS created_at,
      timestamp AS updated_at,
      timestamp AS event_ts,
      0 AS is_deleted
    FROM (
      SELECT
        number AS t,
        ${traceVariablesSql(p)}
      FROM numbers(${p.traces})
    )
    ARRAY JOIN ['helpfulness', 'outcome'] AS score_name
    WHERE (score_name = 'helpfulness' AND h % 5 < 2)
       OR (score_name = 'outcome' AND h % 10 < 3)
  `;

// Small read blocks keep the generated tool payloads (~100s of KB per
// GENERATION) out of memory; 1 GiB insert blocks keep the part count sane.
const INSERT_SETTINGS = {
  max_block_size: "256",
  min_insert_block_size_rows: "0",
  min_insert_block_size_bytes: String(1024 * 1024 * 1024),
  max_insert_threads: "4",
  wait_end_of_query: 1,
  max_execution_time: 0,
  send_progress_in_http_headers: 0,
} as const;

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const p: HeavyAgentParams = {
    projectId: ctx.projectId,
    environment: ctx.environment,
    idPrefix: ctx.idPrefix,
    seed: ctx.seed,
    traces: params["traces"] as number,
    observationsPerTrace: params["observations-per-trace"] as number,
    days: params["days"] as number,
    tools: params["tools"] as number,
    toolSchemaBytes: params["tool-schema-bytes"] as number,
    toolCalls: params["tool-calls"] as number,
    toolCallBytes: params["tool-call-bytes"] as number,
    inputBytes: params["input-bytes"] as number,
    outputBytes: params["output-bytes"] as number,
    metadataKeys: params["metadata-keys"] as number,
    metadataValueBytes: params["metadata-value-bytes"] as number,
    anchorMs: utcDayStartMs(),
  };
  const withScores = params["scores"] as boolean;
  const batchTraces = params["batch-traces"] as number;

  for (const [flag, value, min] of [
    ["traces", p.traces, 1],
    ["observations-per-trace", p.observationsPerTrace, 2],
    ["days", p.days, 1],
    ["tools", p.tools, 1],
    ["tool-schema-bytes", p.toolSchemaBytes, 100],
    ["tool-calls", p.toolCalls, 1],
    ["tool-call-bytes", p.toolCallBytes, 50],
    ["input-bytes", p.inputBytes, 100],
    ["output-bytes", p.outputBytes, 50],
    ["metadata-keys", p.metadataKeys, 1],
    ["metadata-value-bytes", p.metadataValueBytes, 50],
    ["batch-traces", batchTraces, 1],
  ] as const) {
    if (value < min) {
      throw new SeedError(
        `--${flag} must be >= ${min}, got ${value}`,
        `pass an integer >= ${min}, e.g. --${flag} ${min}`,
      );
    }
  }

  const generationsPerTrace = Math.ceil((p.observationsPerTrace - 1) / 4);
  const counts: Record<string, number> = {
    traces: p.traces,
    events: p.traces * p.observationsPerTrace,
    generations: p.traces * generationsPerTrace,
  };
  const links = [tracesListLink(ctx)];
  const traceIds = Array.from(
    { length: Math.min(p.traces, 5) },
    (_, i) => `${ctx.idPrefix}-t${i}`,
  );

  if (ctx.dryRun) {
    return {
      scenario: "heavy-agent-traffic",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds,
      sessionIds: [],
      counts,
      verified: {},
      links,
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  ctx.log(
    `inserting ${counts.events} events (${counts.generations} generations with ~${p.tools} tool definitions each) for ${p.traces} traces over ${p.days} day(s) before ${new Date(p.anchorMs).toISOString()}`,
  );
  for (let first = 0; first < p.traces; first += batchTraces) {
    const traceCount = Math.min(batchTraces, p.traces - first);
    const batchStartedAt = Date.now();
    await clickhouseClient().command({
      query: buildEventsInsertSql(p, first, traceCount),
      clickhouse_settings: INSERT_SETTINGS,
    });
    ctx.log(
      `  traces ${first}..${first + traceCount - 1} inserted in ${Date.now() - batchStartedAt} ms`,
    );
  }

  let scoreCount = 0;
  if (withScores) {
    await clickhouseClient().command({
      query: buildScoresInsertSql(p),
      clickhouse_settings: { wait_end_of_query: 1 },
    });
  }

  // Sessions group 8 traces each; the session detail page 404s without the
  // Postgres rows.
  const sessionCount = Math.ceil(p.traces / 8);
  for (let first = 0; first < sessionCount; first += 1000) {
    await prisma.traceSession.createMany({
      data: Array.from(
        { length: Math.min(1000, sessionCount - first) },
        (_, i) => ({
          id: `${ctx.idPrefix}-s${first + i}`,
          projectId: ctx.projectId,
          environment: ctx.environment,
        }),
      ),
      skipDuplicates: true,
    });
  }

  const prefix = `${escapeLike(ctx.idPrefix)}-t%`;
  const verified: Record<string, number> = {
    events: await countRows(
      "events_core",
      `project_id = {projectId: String} AND trace_id LIKE {prefix: String} AND is_deleted = 0`,
      { projectId: ctx.projectId, prefix },
      "uniqExact(span_id)",
    ),
    generations: await countRows(
      "events_core",
      `project_id = {projectId: String} AND trace_id LIKE {prefix: String} AND type = 'GENERATION' AND length(tool_definitions) > 0`,
      { projectId: ctx.projectId, prefix },
      "uniqExact(span_id)",
    ),
  };
  if (withScores) {
    scoreCount = await countRows(
      "scores",
      `project_id = {projectId: String} AND trace_id LIKE {prefix: String}`,
      { projectId: ctx.projectId, prefix },
      "uniqExact(id)",
    );
    verified.scores = scoreCount;
    counts.scores = scoreCount;
  }

  if (verified.events < counts.events) {
    throw new SeedError(
      `Readback mismatch: expected ${counts.events} events, found ${verified.events}`,
    );
  }
  if (verified.generations < counts.generations) {
    throw new SeedError(
      `Readback mismatch: expected ${counts.generations} generations with tool definitions, found ${verified.generations}`,
    );
  }
  if (withScores && scoreCount === 0) {
    throw new SeedError("Readback mismatch: no trace scores were written");
  }

  return {
    scenario: "heavy-agent-traffic",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds,
    sessionIds: Array.from(
      { length: Math.min(sessionCount, 5) },
      (_, i) => `${ctx.idPrefix}-s${i}`,
    ),
    counts,
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const heavyAgentTrafficScenario: ScenarioDefinition = {
  name: "heavy-agent-traffic",
  description:
    "Bulk v4 agent traffic with huge tool payloads for events/traces list performance: root AGENT + GENERATION/TOOL/TOOL/SPAN turns; every GENERATION declares hundreds of tool JSON schemas and a large tool_calls array. Generated inside ClickHouse; deterministic ids; v4 only.",
  supportsV4: true,
  flags: [
    {
      flag: "traces",
      type: "number",
      default: 20_000,
      description: "number of traces",
    },
    {
      flag: "observations-per-trace",
      type: "number",
      default: 50,
      description:
        "events per trace: 1 root AGENT, then GENERATION/TOOL/TOOL/SPAN turns",
    },
    {
      flag: "days",
      type: "number",
      default: 1,
      description: "spread traces over the N days before today 00:00 UTC",
    },
    {
      flag: "tools",
      type: "number",
      default: 150,
      description:
        "tool definitions per GENERATION (each agent uses 60-140% of it)",
    },
    {
      flag: "tool-schema-bytes",
      type: "number",
      default: 1500,
      description: "approximate size of one tool definition",
    },
    {
      flag: "tool-calls",
      type: "number",
      default: 8,
      description: "average tool calls per GENERATION",
    },
    {
      flag: "tool-call-bytes",
      type: "number",
      default: 1000,
      description: "approximate size of one tool call",
    },
    {
      flag: "input-bytes",
      type: "number",
      default: 16_000,
      description: "approximate GENERATION input (chat history) size",
    },
    {
      flag: "output-bytes",
      type: "number",
      default: 3000,
      description: "approximate GENERATION output size",
    },
    {
      flag: "metadata-keys",
      type: "number",
      default: 24,
      description: "metadata keys per event",
    },
    {
      flag: "metadata-value-bytes",
      type: "number",
      default: 2000,
      description:
        "size of the retrieval.context metadata value on GENERATIONs",
    },
    {
      flag: "scores",
      type: "boolean",
      default: true,
      description:
        "write trace-level scores (helpfulness on 40%, outcome on 30% of traces)",
    },
    {
      flag: "batch-traces",
      type: "number",
      default: 500,
      description: "traces per INSERT statement",
    },
  ],
  run,
};
