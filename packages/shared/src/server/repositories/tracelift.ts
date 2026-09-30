import {
  TraceliftTraceIssuesInputSchema,
  TraceliftTraceIssuesOutputSchema,
  TraceliftIssueCountsInputSchema,
  TraceliftIssueCountsOutputSchema,
  type TraceliftIssue,
  type TraceliftTraceIssuesInput,
  type TraceliftTraceIssuesOutput,
  type TraceliftIssueCountsInput,
  type TraceliftIssueCountsOutput,
} from "../../features/tracelift/types";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";

export async function getTraceliftIssuesForTrace(
  input: TraceliftTraceIssuesInput,
): Promise<TraceliftTraceIssuesOutput> {
  const { projectId, traceId, fromTimestamp, toTimestamp, page, limit } =
    TraceliftTraceIssuesInputSchema.parse(input);
  const rows = await queryClickhouse<
    Omit<TraceliftIssue, "timestamp"> & { timestamp: string }
  >({
    query: `
      SELECT id, project_id AS projectId, trace_id AS traceId,
        observation_id AS observationId, issues, timestamp
      FROM tracelift_issues
      WHERE project_id = {projectId: String}
        AND trace_id = {traceId: String}
        ${fromTimestamp ? "AND timestamp >= {fromTimestamp: DateTime64(6)}" : ""}
        ${toTimestamp ? "AND timestamp < {toTimestamp: DateTime64(6)}" : ""}
      ORDER BY timestamp DESC, id ASC, observation_id ASC, issues ASC
      LIMIT {limit: UInt64} OFFSET {offset: UInt64}
    `,
    params: {
      projectId,
      traceId,
      ...(fromTimestamp
        ? { fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp) }
        : {}),
      ...(toTimestamp
        ? { toTimestamp: convertDateToClickhouseDateTime(toTimestamp) }
        : {}),
      limit: limit + 1,
      offset: page * limit,
    },
    tags: { projectId },
  });

  return TraceliftTraceIssuesOutputSchema.parse({
    issues: rows.slice(0, limit).map((row) => ({
      ...row,
      timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
    })),
    hasMore: rows.length > limit,
  });
}

export async function getTraceliftIssueCounts(
  input: TraceliftIssueCountsInput,
): Promise<TraceliftIssueCountsOutput> {
  const { projectId, fromTimestamp, toTimestamp } =
    TraceliftIssueCountsInputSchema.parse(input);
  const rows = await queryClickhouse<{
    issue: string;
    count: string;
    examples: [string, string | null][];
  }>({
    query: `
      SELECT issues AS issue, count() AS count,
        groupUniqArray(5)(tuple(trace_id, observation_id)) AS examples
      FROM tracelift_issues
      WHERE project_id = {projectId: String}
        AND timestamp >= {fromTimestamp: DateTime64(6)}
        AND timestamp < {toTimestamp: DateTime64(6)}
      GROUP BY issues
      ORDER BY count DESC, issue ASC
    `,
    params: {
      projectId,
      fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp),
      toTimestamp: convertDateToClickhouseDateTime(toTimestamp),
    },
    tags: { projectId },
  });

  const counts = rows.map((row) => ({
    issue: row.issue,
    count: Number(row.count),
    examples: row.examples.map(([traceId, observationId]) => ({
      traceId,
      observationId,
    })),
  }));
  return TraceliftIssueCountsOutputSchema.parse({
    counts,
    totalCount: counts.reduce((total, row) => total + row.count, 0),
  });
}
