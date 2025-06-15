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
];
