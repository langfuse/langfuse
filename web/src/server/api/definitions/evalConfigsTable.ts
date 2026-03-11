import {
  EvalTargetObject,
  type ColumnDefinition,
  JobConfigState,
} from "@langfuse/shared";

export const evalConfigTargetOptions = Object.values(EvalTargetObject).map(
  (value) => ({
    value,
  }),
);

export const evalConfigTargetValues = evalConfigTargetOptions.map(
  (option) => option.value,
);

export const evalConfigFilterColumns: ColumnDefinition[] = [
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: 'jc."status"::text',
    options: Object.values(JobConfigState).map((value) => ({ value })),
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
