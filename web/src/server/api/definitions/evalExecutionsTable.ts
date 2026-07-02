import type { ColumnDefinition } from "@langfuse/shared";

const FILTERABLE_JOB_EXECUTION_STATUSES = [
  "COMPLETED",
  "ERROR",
  "PENDING",
  "DELAYED",
] as const;

export const evalExecutionsFilterCols: ColumnDefinition[] = [
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: 'je."status"::text',
    options: FILTERABLE_JOB_EXECUTION_STATUSES.map((value) => ({ value })),
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
