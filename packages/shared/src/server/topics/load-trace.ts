import { isRootObservation } from "../../eventsTable";
import { DEFAULT_TRACE_ENVIRONMENT } from "../ingestion/types";
import { EventsQueryBuilder } from "../queries/clickhouse-sql/event-query-builder";
import { queryClickhouseStream } from "../repositories/clickhouse";
import type { TopicsObservation } from "./transcript";

const MAX_OBSERVATIONS = 2_000;
const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;

type SnapshotRow = {
  project_id: string;
  trace_id: string;
  session_id: string;
  environment: string;
  trace_name: string;
  span_id: string;
  parent_span_id: string | null;
  is_app_root: boolean;
  start_time: string;
  end_time: string | null;
  type: string;
  name: string;
  level: string;
  status_message: string | null;
  input: string;
  output: string;
  metadata: Record<string, string>;
};

const utcTimestamp = (value: string) =>
  value.includes("T") ? value : `${value.replace(" ", "T")}Z`;

/** Read one project-scoped v4 trace, failing instead of returning partial I/O. */
export async function loadTraceSnapshot(params: {
  projectId: string;
  traceId: string;
}) {
  const { projectId, traceId } = params;
  const builder = new EventsQueryBuilder({ projectId })
    .selectRaw(
      "e.project_id",
      "e.trace_id",
      "e.session_id",
      "e.environment",
      "e.trace_name",
      "e.is_app_root",
      "e.span_id",
      "e.parent_span_id",
      "e.start_time",
      "e.end_time",
      "e.type",
      "e.name",
      "e.level",
      "e.status_message",
    )
    .selectIO(false)
    .selectMetadataExpanded()
    .forceFullTable()
    .whereRaw("e.trace_id = {traceId: String}", { traceId })
    .whereRaw("xxHash32(e.trace_id) = xxHash32({traceId: String})", { traceId })
    .orderByColumns([
      { column: "e.event_ts", direction: "DESC" },
      // Equal storage timestamps need a stable choice; they do not establish causal order.
      {
        column:
          "cityHash64(tuple(e.environment, e.trace_name, e.is_app_root, e.parent_span_id, e.start_time, e.end_time, e.type, e.name, e.level, e.status_message, e.input, e.output, e.metadata_names, e.metadata_values))",
        direction: "DESC",
      },
    ])
    .limitBy("e.span_id", "e.project_id")
    .limit(MAX_OBSERVATIONS + 1);
  const { query, params: queryParams } = builder.buildWithParams();
  const observations: TopicsObservation[] = [];
  let sessionId: string | null = null;
  let environment = "";
  let traceName = "";
  let rootName = "";
  let bytes = 0;
  for await (const row of queryClickhouseStream<SnapshotRow>({
    query,
    params: queryParams,
    preferredClickhouseService: "EventsReadOnly",
    tags: { projectId },
    clickhouseSettings: {
      max_threads: 2,
      max_execution_time: 30,
      timeout_overflow_mode: "throw",
      max_result_bytes: String(MAX_SNAPSHOT_BYTES),
      result_overflow_mode: "throw",
    },
  })) {
    if (row.project_id !== projectId || row.trace_id !== traceId)
      throw new Error("Trace snapshot scope mismatch");
    // Rows arrive newest first; retain the latest non-empty trace context.
    if (!sessionId && row.session_id) sessionId = row.session_id;
    if (!environment && row.environment) environment = row.environment;
    if (!traceName && row.trace_name) traceName = row.trace_name;
    if (
      !rootName &&
      row.name &&
      isRootObservation({
        parentObservationId: row.parent_span_id,
        isAppRoot: row.is_app_root,
      })
    )
      rootName = row.name;
    bytes += Buffer.byteLength(JSON.stringify(row));
    if (bytes > MAX_SNAPSHOT_BYTES || observations.length >= MAX_OBSERVATIONS) {
      throw new Error(
        "Trace exceeds the Topics PoC limit (2,000 observations or 10 MiB)",
      );
    }
    observations.push({
      id: row.span_id,
      projectId,
      traceId,
      parentObservationId: row.parent_span_id || null,
      startTime: utcTimestamp(row.start_time),
      endTime: row.end_time ? utcTimestamp(row.end_time) : null,
      type: row.type,
      name: row.name,
      level: row.level,
      statusMessage: row.status_message || null,
      input: row.input,
      output: row.output,
      metadata: row.metadata,
    });
  }
  if (!observations.length)
    throw new Error(
      "Trace not found in this project's v4 events; legacy-only traces are not supported by this PoC",
    );
  return {
    projectId,
    traceId,
    sessionId,
    environment: environment || DEFAULT_TRACE_ENVIRONMENT,
    traceName: traceName || rootName,
    observations,
    timestamp: observations.reduce(
      (earliest, row) => (row.startTime < earliest ? row.startTime : earliest),
      observations[0].startTime,
    ),
  };
}
