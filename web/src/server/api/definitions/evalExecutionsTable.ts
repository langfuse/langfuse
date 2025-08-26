import { JobExecutionStatus } from "@langfuse/shared/prisma";
import { type ColumnDefinition } from "@langfuse/shared/tableDefinitions";

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
