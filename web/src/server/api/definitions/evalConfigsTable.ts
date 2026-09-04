import {
  EvalTargetObject,
  type ColumnDefinition,
  JobConfigState,
  JobTimeScopeZod,
} from "@langfuse/shared";

const evalConfigTargetOptions = Object.values(EvalTargetObject).map(
  (value) => ({
    value,
  }),
);

export const evalConfigTargetValues = evalConfigTargetOptions.map(
  (option) => option.value,
);

export const evalConfigTimeScopeValues = JobTimeScopeZod.options;

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
    options: [...Object.values(JobConfigState), "PAUSED"].map((value) => ({
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
  {
    name: "Time Scope",
    id: "timeScope",
    type: "arrayOptions",
    internal: 'jc."time_scope"',
    options: evalConfigTimeScopeValues.map((value) => ({ value })),
  },
];

export const evalConfigsTableCols: ColumnDefinition[] = [
  {
    ...evalConfigFilterColumns[0],
    internal: evaluatorStatusSortRankSql,
  },
  evalConfigFilterColumns[1],
  evalConfigFilterColumns[2],
  {
    name: "Generated Score Name",
    id: "scoreName",
    type: "string",
    internal: 'jc."score_name"',
  },
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
