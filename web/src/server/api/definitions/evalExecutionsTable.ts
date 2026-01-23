import { type ColumnDefinition, JobExecutionStatus } from "@langfuse/shared";

export const evalExecutionsFilterCols: ColumnDefinition[] = [
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: 'je."status"::text',
    options: Object.values(JobExecutionStatus)
      .filter((value) => value !== JobExecutionStatus.CANCELLED)
      .map((value) => ({ value })),
  },
  {
    name: "Trace ID",
    id: "traceId",
    type: "string",
    internal: 'je."job_input_trace_id"',
  },
  {
    name: "Session ID",
    id: "sessionId",
    type: "string",
    internal: 't."session_id"',
  },
  {
    name: "Execution Trace ID",
    id: "executionTraceId",
    type: "string",
    internal: 'je."execution_trace_id"',
  },
  {
    name: "Score Value",
    id: "scoreValue",
    type: "number",
    internal: 's."value"',
  },
];
