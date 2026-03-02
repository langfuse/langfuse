import { type ColumnDefinition, JobExecutionStatus } from "@langfuse/shared";
import { isOceanBase } from "@/src/utils/oceanbase";

function evalExecutionsFilterColsDef(): ColumnDefinition[] {
  const ob = isOceanBase();
  return [
    {
      name: "Status",
      id: "status",
      type: "stringOptions",
      internal: ob ? "je.status" : 'je."status"::text',
      options: Object.values(JobExecutionStatus)
        .filter((value) => value !== JobExecutionStatus.CANCELLED)
        .map((value) => ({ value })),
    },
    {
      name: "Trace ID",
      id: "traceId",
      type: "string",
      internal: ob ? "je.job_input_trace_id" : 'je."job_input_trace_id"',
    },
    {
      name: "Session ID",
      id: "sessionId",
      type: "string",
      internal: ob ? "t.session_id" : 't."session_id"',
    },
    {
      name: "Execution Trace ID",
      id: "executionTraceId",
      type: "string",
      internal: ob ? "je.execution_trace_id" : 'je."execution_trace_id"',
    },
    {
      name: "Score Value",
      id: "scoreValue",
      type: "number",
      internal: ob ? "s.value" : 's."value"',
    },
  ];
}

export const evalExecutionsFilterCols = evalExecutionsFilterColsDef();
