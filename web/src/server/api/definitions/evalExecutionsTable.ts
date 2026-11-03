import {
  type ColumnDefinition,
  type JobExecutionStatus,
} from "@langfuse/shared";

// Client-safe mirror of the Prisma enum — see evalConfigsTable.ts.
const JOB_EXECUTION_STATUSES = [
  "COMPLETED",
  "ERROR",
  "PENDING",
  "CANCELLED",
  "DELAYED",
] as const satisfies readonly JobExecutionStatus[];

export const evalExecutionsFilterCols: ColumnDefinition[] = [
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: 'je."status"::text',
    options: JOB_EXECUTION_STATUSES.filter(
      (value) => value !== "CANCELLED",
    ).map((value) => ({ value })),
  },
  {
    name: "Trace ID",
    id: "traceId",
    type: "string",
    internal: 'je."job_input_trace_id"',
  },
  {
    name: "Execution Trace ID",
    id: "executionTraceId",
    type: "string",
    internal: 'je."execution_trace_id"',
  },
];
