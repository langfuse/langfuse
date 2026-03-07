import { type ColumnDefinition, JobConfigState } from "@langfuse/shared";

export const evalConfigFilterColumns: ColumnDefinition[] = [
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: `CASE
      WHEN jc."status" = 'INACTIVE' THEN 'INACTIVE'
      WHEN jc."blocked_at" IS NOT NULL THEN 'PAUSED'
      ELSE jc."status"::text
    END`,
    options: [...Object.values(JobConfigState), "PAUSED"].map((value) => ({
      value,
    })),
  },
  {
    name: "Target",
    id: "target",
    type: "stringOptions",
    internal: 'jc."target_object"',
    options: [{ value: "trace" }, { value: "dataset" }],
  },
];

export const evalConfigsTableCols: ColumnDefinition[] = [
  ...evalConfigFilterColumns,
  {
    name: "Updated At",
    id: "updatedAt",
    type: "datetime",
    internal: 'jc."updated_at"',
  },
  {
    name: "Created At",
    id: "createdAt",
    type: "datetime",
    internal: 'jc."created_at"',
  },
];
