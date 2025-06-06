import { type ColumnDefinition } from "@langfuse/shared";

export const datasetItemsTableCols: ColumnDefinition[] = [
  {
    name: "ID",
    id: "id",
    type: "string",
    internal: 'dataset_items."id"',
  },
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    options: [{ value: "ACTIVE" }, { value: "ARCHIVED" }],
    internal: 'dataset_items."status"',
  },
  {
    name: "Input",
    id: "input",
    type: "stringObject",
    internal: 'dataset_items."input"',
  },
  {
    name: "Expected Output",
    id: "expectedOutput",
    type: "stringObject",
    internal: 'dataset_items."expected_output"',
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: 'dataset_items."metadata"',
  },
  {
    name: "Created At",
    id: "createdAt",
    type: "datetime",
    internal: 'dataset_items."created_at"',
  },
  {
    name: "Source Trace ID",
    id: "sourceTraceId",
    type: "string",
    internal: 'dataset_items."source_trace_id"',
    nullable: true,
  },
  {
    name: "Source Observation ID",
    id: "sourceObservationId",
    type: "string",
    internal: 'dataset_items."source_observation_id"',
    nullable: true,
  },
];
