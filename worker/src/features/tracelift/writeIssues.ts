import {
  buildClickHouseLogComment,
  clickhouseClient,
  convertDateToClickhouseDateTime,
} from "@langfuse/shared/src/server";
import { z } from "zod";
import {
  TraceliftIssueInsertSchema,
  type TraceliftIssueInsert,
} from "@langfuse/shared";

export type TraceliftIssue = TraceliftIssueInsert;

export async function writeTraceliftIssues(
  projectId: string,
  issues: readonly TraceliftIssue[],
): Promise<void> {
  if (!issues.length) return;

  z.string().min(1).parse(projectId);
  const rows = z
    .array(TraceliftIssueInsertSchema)
    .parse(issues)
    .map((issue) => ({
      id: issue.id,
      project_id: projectId,
      trace_id: issue.traceId,
      observation_id: issue.observationId ?? null,
      issues: issue.issues,
      timestamp: convertDateToClickhouseDateTime(issue.timestamp),
    }));

  for (let offset = 0; offset < rows.length; offset += 10_000) {
    await clickhouseClient().insert({
      table: "tracelift_issues",
      format: "JSONEachRow",
      values: rows.slice(offset, offset + 10_000),
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 1,
        log_comment: buildClickHouseLogComment({
          surface: "worker",
          route: "tracelift-write-issues",
          projectId,
        }),
      },
    });
  }
}
