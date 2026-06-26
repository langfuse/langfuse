import type { ColumnDefinition } from "@langfuse/shared";

const EVAL_CONFIG_TARGET_VALUES = [
  "trace",
  "dataset",
  "event",
  "experiment",
] as const;

const JOB_CONFIG_STATE_VALUES = ["ACTIVE", "INACTIVE"] as const;

export const evalConfigTargetOptions = EVAL_CONFIG_TARGET_VALUES.map(
  (value) => ({ value }),
);

export const evalConfigTargetValues = evalConfigTargetOptions.map(
  (option) => option.value,
);

const evaluatorDisplayStatusSql = `CASE
  WHEN jc."status" = 'INACTIVE' THEN 'INACTIVE'
  WHEN jc."blocked_at" IS NOT NULL THEN 'PAUSED'
  ELSE jc."status"::text
END`;

const evaluatorStatusSortRankSql = `CASE
  WHEN jc."status" = 'INACTIVE' THEN 2
  WHEN jc."blocked_at" IS NOT NULL THEN 1
  ELSE 0
END`;

export const evalConfigFilterColumns: ColumnDefinition[] = [
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: evaluatorDisplayStatusSql,
    options: [...JOB_CONFIG_STATE_VALUES, "PAUSED"].map((value) => ({
      value,
    })),
  },
  {
    name: "Target",
    id: "target",
    type: "stringOptions",
    internal: 'jc."target_object"',
    options: evalConfigTargetOptions,
  },
];

export const evalConfigsTableCols: ColumnDefinition[] = [
  {
    ...evalConfigFilterColumns[0],
    internal: evaluatorStatusSortRankSql,
  },
  evalConfigFilterColumns[1],
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
