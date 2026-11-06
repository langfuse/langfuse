import { AGENT_LIMITS, type AgentDetailInput } from "../../features/agents/api";
import {
  AgentQualityScoreSchema,
  type AgentQualityInput,
  type AgentQualityOptions,
  type AgentQualityResult,
  type AgentQualityStats,
  type AgentRelationshipsResult,
  type AgentRelationship,
  type AgentRelationshipNode,
} from "../../features/agents/insights-api";
import {
  AGENT_QUERY_SETTINGS,
  buildAgentBoundedEvents,
  buildAgentScopedEvents,
  agentEnvironmentFilter,
} from "./agents";
import { agentActivityLayout } from "./agent-activity-buckets";
import {
  queryClickhouse,
  parseClickhouseUTCDateTimeFormat,
} from "./clickhouse";
import { bindUtcDateTimeParam } from "../queries/clickhouse-sql/clickhouse-filter";
import { SCORE_TO_TRACE_OBSERVATIONS_INTERVAL } from "./constants";

type Query = { query: string; params: Record<string, unknown> };
type Row = Record<string, unknown>;
const RUN = "type = 'AGENT' AND agent_run_id = span_id AND agent_run_id != ''";
const MAX_SCORE_OPTIONS = 100;
const MAX_MODELS = 20;
const MAX_RELATIONSHIP_TRACES = 200;
const MAX_RELATIONSHIP_SPANS = 20_000;
const MODEL_KINDS = ["single", "multiple", "unknown"] as const;

async function execute(query: Query, projectId: string): Promise<Row[]> {
  return queryClickhouse<Row>({
    ...query,
    params: query.params as Record<string, string | number | string[]>,
    tags: { projectId },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseSettings: AGENT_QUERY_SETTINGS,
  });
}

function prefixQuery(input: Query, prefix: string): Query {
  let query = input.query;
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.params)) {
    query = query.replaceAll(`{${key}:`, `{${prefix}${key}:`);
    params[`${prefix}${key}`] = value;
  }
  return { query, params };
}

function qualityCohort(input: AgentDetailInput): Query {
  const duration = input.to.getTime() - input.from.getTime();
  const columns = ["e.provided_model_name AS provided_model_name"];
  const current = prefixQuery(
    buildAgentScopedEvents(input, input.identity, columns),
    "current_",
  );
  const previous = prefixQuery(
    buildAgentScopedEvents(
      {
        ...input,
        from: new Date(input.from.getTime() - duration),
        to: input.from,
      },
      input.identity,
      columns,
    ),
    "previous_",
  );
  const scoreFrom = bindUtcDateTimeParam(
    "scoreFrom",
    new Date(input.from.getTime() - duration),
  );
  return {
    query: `scoped AS (
      SELECT *, 'current' AS period FROM (${current.query})
      UNION ALL SELECT *, 'previous' AS period FROM (${previous.query})
    ), runs AS (SELECT period, trace_id, span_id, start_time FROM scoped WHERE ${RUN}),
    score_candidates AS (
      SELECT id FROM scores WHERE project_id = {insightProject: String}
      AND timestamp >= ${scoreFrom.placeholder} - ${SCORE_TO_TRACE_OBSERVATIONS_INTERVAL}
      AND (trace_id, observation_id) IN (SELECT trace_id, span_id FROM runs)
    ), latest_scores AS (
      SELECT id, trace_id, observation_id, name, value, data_type, source, config_id, is_deleted
      FROM scores WHERE project_id = {insightProject: String} AND id IN (SELECT id FROM score_candidates)
      ORDER BY event_ts DESC LIMIT 1 BY id
    ), run_scores AS (
      SELECT s.* FROM latest_scores s
      WHERE is_deleted = 0 AND data_type IN ('NUMERIC', 'BOOLEAN') AND isFinite(value)
      AND (trace_id, observation_id) IN (SELECT trace_id, span_id FROM runs)
    )`,
    params: {
      ...current.params,
      ...previous.params,
      insightProject: input.projectId,
      scoreFrom: scoreFrom.value,
    },
  };
}

/** Only observation scores on this agent's recorded runs are eligible. */
export async function getAgentQualityOptions(
  input: AgentDetailInput,
): Promise<AgentQualityOptions> {
  const base = qualityCohort(input);
  const rows = await execute(
    {
      query: `WITH ${base.query}
      SELECT name, data_type, source, config_id, uniqExact((trace_id, observation_id)) AS scored_runs
      FROM run_scores GROUP BY name, data_type, source, config_id
      ORDER BY scored_runs DESC, name, data_type, source, config_id LIMIT ${MAX_SCORE_OPTIONS + 1}`,
      params: base.params,
    },
    input.projectId,
  );
  return {
    items: rows.slice(0, MAX_SCORE_OPTIONS).map((row) => ({
      ...AgentQualityScoreSchema.parse({
        name: row.name,
        dataType: row.data_type,
        source: row.source,
        configId: row.config_id,
      }),
      scoredRuns: Number(row.scored_runs),
    })),
    hasMore: rows.length > MAX_SCORE_OPTIONS,
  };
}

const emptyQuality = (): AgentQualityStats => ({
  average: null,
  scoredRuns: 0,
  totalRuns: 0,
});
function qualityStats(row: Row | undefined, prefix = ""): AgentQualityStats {
  if (!row) return emptyQuality();
  const scoredRuns = Number(row[`${prefix}scored_runs`] ?? 0);
  return {
    average:
      scoredRuns > 0 ? Number(row[`${prefix}score_sum`]) / scoredRuns : null,
    scoredRuns,
    totalRuns: Number(row[`${prefix}total_runs`] ?? 0),
  };
}

/** Repeated evaluations first average within one run so heavily scored runs do not dominate. */
export async function getAgentQuality(
  input: AgentQualityInput,
): Promise<AgentQualityResult> {
  const score = AgentQualityScoreSchema.parse(input.score);
  const { bucketMs, length } = agentActivityLayout(input);
  const base = qualityCohort(input);
  const from = bindUtcDateTimeParam("qualityFrom", input.from);
  const measures = (period: string) =>
    `countIf(period = '${period}') AS ${period}_total_runs,
    countIf(period = '${period}' AND score_known = 1) AS ${period}_scored_runs,
    sumIf(score_value, period = '${period}' AND score_known = 1) AS ${period}_score_sum`;
  const rows = await execute(
    {
      query: `WITH ${base.query}, selected_scores AS (
      SELECT trace_id, observation_id, avg(value) AS score_value, 1 AS score_known
      FROM run_scores WHERE name = {scoreName: String} AND data_type = {scoreType: String}
      AND source = {scoreSource: String} AND ifNull(config_id, '') = {scoreConfig: String}
      GROUP BY trace_id, observation_id
    ), models AS (
      SELECT period, trace_id, agent_run_id,
      groupUniqArrayIf(2)(provided_model_name, provided_model_name != '') AS names,
      countIf(provided_model_name = '') AS unknown_names
      FROM scoped WHERE type = 'GENERATION' AND agent_run_id != ''
      GROUP BY period, trace_id, agent_run_id
    ), scored AS (
      SELECT r.period AS period, r.trace_id AS trace_id, r.span_id AS span_id, r.start_time AS start_time,
      s.score_value AS score_value, s.score_known AS score_known,
      if(r.period = 'current', toInt64(intDiv(toUnixTimestamp64Milli(r.start_time) - toUnixTimestamp64Milli(${from.placeholder}), {qualityBucketMs: UInt64})), -1) AS bucket_index,
      multiIf(length(m.names) = 0 OR m.unknown_names > 0, 'unknown', length(m.names) = 1, 'single', 'multiple') AS model_kind,
      if(model_kind = 'single', m.names[1], '') AS model_name
      FROM runs r LEFT ANY JOIN selected_scores s ON r.trace_id = s.trace_id AND r.span_id = s.observation_id
      LEFT ANY JOIN models m ON r.period = m.period AND r.trace_id = m.trace_id AND r.span_id = m.agent_run_id
    ), aggregated AS (
      SELECT multiIf(grouping(bucket_index) = 0, 'bucket', grouping(model_kind) = 0, 'model', 'summary') AS section,
      bucket_index, model_kind, model_name, ${measures("current")}, ${measures("previous")}
      FROM scored GROUP BY GROUPING SETS ((), (bucket_index), (model_kind, model_name))
    )
    SELECT * EXCEPT(section_rank) FROM (
      SELECT *, row_number() OVER (PARTITION BY section ORDER BY current_total_runs + previous_total_runs DESC, model_kind, model_name) AS section_rank
      FROM aggregated
    ) WHERE (section != 'model' OR section_rank <= ${MAX_MODELS + 1})
      AND (section != 'bucket' OR bucket_index >= 0)`,
      params: {
        ...base.params,
        qualityFrom: from.value,
        qualityBucketMs: bucketMs,
        scoreName: score.name,
        scoreType: score.dataType,
        scoreSource: score.source,
        scoreConfig: score.configId ?? "",
      },
    },
    input.projectId,
  );
  const summary = rows.find((row) => row.section === "summary");
  const modelRows = rows.filter((row) => row.section === "model");
  const byBucket = new Map(
    rows
      .filter((row) => row.section === "bucket")
      .map((row) => [Number(row.bucket_index), row]),
  );
  return {
    from: input.from,
    to: input.to,
    previousFrom: new Date(
      input.from.getTime() - (input.to.getTime() - input.from.getTime()),
    ),
    previousTo: input.from,
    bucketMs,
    score,
    current: qualityStats(summary, "current_"),
    previous: qualityStats(summary, "previous_"),
    buckets: Array.from({ length }, (_, index) => ({
      timestamp: new Date(input.from.getTime() + index * bucketMs),
      ...qualityStats(byBucket.get(index), "current_"),
    })),
    models: modelRows.slice(0, MAX_MODELS).map((row) => ({
      kind: MODEL_KINDS.find((kind) => kind === row.model_kind) ?? "unknown",
      name:
        typeof row.model_name === "string" && row.model_name
          ? row.model_name
          : null,
      current: qualityStats(row, "current_"),
      previous: qualityStats(row, "previous_"),
    })),
    hasMoreModels: modelRows.length > MAX_MODELS,
  };
}

type RelationshipSpan = {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  runId: string;
  type: string;
  startTime: Date;
  node: AgentRelationshipNode | null;
  cost: number | null;
};

/** A bounded trace sample proves ancestry through ordinary spans; co-occurrence is not delegation. */
export async function getAgentRelationships(
  input: AgentDetailInput,
): Promise<AgentRelationshipsResult> {
  const scoped = buildAgentScopedEvents(input, input.identity, []);
  const traceRows = await execute(
    {
      query: `SELECT trace_id, max(start_time) AS last_seen FROM (${scoped.query}) WHERE ${RUN}
      GROUP BY trace_id ORDER BY last_seen DESC, trace_id LIMIT ${MAX_RELATIONSHIP_TRACES + 1}`,
      params: scoped.params,
    },
    input.projectId,
  );
  const traceIds = traceRows
    .slice(0, MAX_RELATIONSHIP_TRACES)
    .map((row) => String(row.trace_id));
  const coverage = {
    traces: traceIds.length,
    spans: 0,
    unresolvedRuns: 0,
    truncated: traceRows.length > MAX_RELATIONSHIP_TRACES,
    maxTraces: MAX_RELATIONSHIP_TRACES,
    maxSpans: MAX_RELATIONSHIP_SPANS,
  };
  if (!traceIds.length) return { items: [], coverage };
  const snapshot = buildAgentBoundedEvents(input)
    .selectRaw(
      "e.trace_id AS trace_id",
      "e.span_id AS span_id",
      "e.parent_span_id AS parent_span_id",
      "e.agent_id AS agent_id",
      "e.agent_name AS agent_name",
      "e.agent_run_id AS agent_run_id",
      "e.type AS type",
      "e.start_time AS start_time",
      "e.environment AS environment",
      "e.is_deleted AS is_deleted",
      "if(mapContains(e.cost_details, 'total'), e.cost_details['total'], NULL) AS model_cost",
    )
    .whereRaw("e.trace_id IN {relationshipTraces: Array(String)}", {
      relationshipTraces: traceIds,
    })
    .orderBy("ORDER BY e.event_ts DESC, e.trace_id, e.span_id")
    .limitBy("e.trace_id", "e.span_id")
    .buildWithParams();
  const environment = agentEnvironmentFilter(input);
  const rows = await execute(
    {
      query: `SELECT * FROM (${snapshot.query}) WHERE is_deleted = 0 ${environment.query ? `AND (${environment.query})` : ""}
      ORDER BY trace_id, start_time, span_id LIMIT ${MAX_RELATIONSHIP_SPANS + 1}`,
      params: { ...snapshot.params, ...environment.params },
    },
    input.projectId,
  );
  coverage.truncated =
    coverage.truncated || rows.length > MAX_RELATIONSHIP_SPANS;
  coverage.spans = Math.min(rows.length, MAX_RELATIONSHIP_SPANS);
  // Drop an incomplete tail trace so its partial children cannot look like a complete delegation.
  const incompleteTrace =
    rows.length > MAX_RELATIONSHIP_SPANS &&
    rows[MAX_RELATIONSHIP_SPANS]!.trace_id ===
      rows[MAX_RELATIONSHIP_SPANS - 1]!.trace_id
      ? String(rows[MAX_RELATIONSHIP_SPANS - 1]!.trace_id)
      : null;
  const spans = rows
    .slice(0, MAX_RELATIONSHIP_SPANS)
    .filter((row) => row.trace_id !== incompleteTrace)
    .map(
      (row): RelationshipSpan => ({
        traceId: String(row.trace_id),
        spanId: String(row.span_id),
        parentSpanId: String(row.parent_span_id ?? ""),
        runId: String(row.agent_run_id ?? ""),
        type: String(row.type),
        startTime: parseClickhouseUTCDateTimeFormat(String(row.start_time)),
        node: relationshipNode(row),
        cost:
          row.model_cost == null || !Number.isFinite(Number(row.model_cost))
            ? null
            : Number(row.model_cost),
      }),
    );
  coverage.traces = new Set(spans.map((span) => span.traceId)).size;
  const bySpan = new Map(
    spans.map((span) => [spanKey(span.traceId, span.spanId), span]),
  );
  const modelsByRun = new Map<string, RelationshipSpan[]>();
  for (const span of spans) {
    if (span.type !== "GENERATION" || !span.runId) continue;
    const key = spanKey(span.traceId, span.runId);
    const models = modelsByRun.get(key) ?? [];
    models.push(span);
    modelsByRun.set(key, models);
  }
  const edges = new Map<
    string,
    { edge: AgentRelationship; traces: Set<string> }
  >();
  for (const child of spans) {
    if (
      child.type !== "AGENT" ||
      child.runId !== child.spanId ||
      !child.node ||
      !child.parentSpanId
    )
      continue;
    let parentId = child.parentSpanId;
    const visited = new Set([child.spanId]);
    let parent: RelationshipSpan | undefined;
    let invalidAncestry = false;
    while (parentId && visited.size <= 128) {
      if (visited.has(parentId)) {
        invalidAncestry = true;
        break;
      }
      visited.add(parentId);
      const candidate = bySpan.get(spanKey(child.traceId, parentId));
      if (!candidate) break;
      if (
        !parent &&
        candidate.type === "AGENT" &&
        candidate.runId === candidate.spanId
      ) {
        if (!candidate.node) {
          invalidAncestry = true;
          break;
        }
        parent = candidate;
      }
      parentId = candidate.parentSpanId;
    }
    if (!parent?.node || invalidAncestry || visited.size > 128) {
      if (parentId) coverage.unresolvedRuns++;
      continue;
    }
    const matches = (node: AgentRelationshipNode) =>
      node.identity.kind === input.identity.kind &&
      node.identity.value === input.identity.value;
    if (!matches(parent.node) && !matches(child.node)) continue;
    const key = JSON.stringify([parent.node.identity, child.node.identity]);
    let found = edges.get(key);
    if (!found) {
      found = {
        edge: {
          parent: parent.node,
          child: child.node,
          runs: 0,
          traces: 0,
          childOwnModelCost: null,
          pricedModelCalls: 0,
          modelCalls: 0,
          example: {
            traceId: child.traceId,
            observationId: child.spanId,
            startTime: child.startTime,
          },
        },
        traces: new Set(),
      };
      edges.set(key, found);
    }
    found.edge.runs++;
    found.traces.add(child.traceId);
    const models = (
      modelsByRun.get(spanKey(child.traceId, child.spanId)) ?? []
    ).filter((model) => model.node && matchesIdentity(model.node, child.node!));
    found.edge.modelCalls += models.length;
    for (const model of models)
      if (model.cost !== null) {
        found.edge.pricedModelCalls++;
        found.edge.childOwnModelCost =
          (found.edge.childOwnModelCost ?? 0) + model.cost;
      }
  }
  return {
    items: [...edges.values()]
      .map(({ edge, traces }) => ({ ...edge, traces: traces.size }))
      .sort(
        (a, b) =>
          b.runs - a.runs ||
          a.child.displayName.localeCompare(b.child.displayName),
      ),
    coverage,
  };
}

function spanKey(traceId: string, spanId: string) {
  return JSON.stringify([traceId, spanId]);
}

function relationshipNode(row: Row): AgentRelationshipNode | null {
  const id = String(row.agent_id ?? "");
  const name = String(row.agent_name ?? "");
  const validName =
    name.trim().length > 0 &&
    Array.from(name).length <= AGENT_LIMITS.nameLength;
  if (id) {
    if (!id.trim() || Array.from(id).length > AGENT_LIMITS.idLength)
      return null;
    return {
      identity: { kind: "id", value: id },
      displayName: validName ? name : id,
    };
  }
  return validName
    ? { identity: { kind: "name", value: name }, displayName: name }
    : null;
}

function matchesIdentity(
  left: AgentRelationshipNode,
  right: AgentRelationshipNode,
) {
  return (
    left.identity.kind === right.identity.kind &&
    left.identity.value === right.identity.value
  );
}
