import { type ColumnDefinition, JobConfigState } from "@langfuse/shared";
import { isOceanBase } from "@/src/utils/oceanbase";

function evalConfigFilterColumnsDef(): ColumnDefinition[] {
  const ob = isOceanBase();
  return [
    {
      name: "Status",
      id: "status",
      type: "stringOptions",
      internal: ob ? "jc.status" : 'jc."status"::text',
      options: Object.values(JobConfigState).map((value) => ({ value })),
    },
    {
      name: "Target",
      id: "target",
      type: "stringOptions",
      internal: ob ? "jc.target_object" : 'jc."target_object"',
      options: [{ value: "trace" }, { value: "dataset" }],
    },
  ];
}

function evalConfigsTableColsDef(): ColumnDefinition[] {
  const ob = isOceanBase();
  return [
    ...evalConfigFilterColumnsDef(),
    {
      name: "Updated At",
      id: "updatedAt",
      type: "datetime",
      internal: ob ? "jc.updated_at" : 'jc."updated_at"',
    },
    {
      name: "Created At",
      id: "createdAt",
      type: "datetime",
      internal: ob ? "jc.created_at" : 'jc."created_at"',
    },
  ];
}

export const evalConfigFilterColumns = evalConfigFilterColumnsDef();
export const evalConfigsTableCols = evalConfigsTableColsDef();
