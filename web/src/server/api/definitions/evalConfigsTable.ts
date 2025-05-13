import {
  type ColumnDefinition,
  JobConfigState,
  type SingleValueOption,
  formatColumnOptions,
} from "@langfuse/shared";

export const evalConfigsTableCols: ColumnDefinition[] = [
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
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: 'jc."status"',
    options: Object.values(JobConfigState).map((value) => ({ value })),
  },
  {
    name: "Target",
    id: "target",
    type: "stringOptions",
    internal: 'jc."target_object"',
    options: [], // to be added at runtime
  },
];

export type EvalConfigOptions = {
  target: Array<SingleValueOption>;
};

export function evalConfigsTableColsWithOptions(
  options?: EvalConfigOptions,
): ColumnDefinition[] {
  return evalConfigsTableCols.map((col) => {
    if (col.id === "target") {
      return formatColumnOptions(col, options?.target ?? []);
    }
    return col;
  });
}
