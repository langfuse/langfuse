import { DatasetStatus } from "@prisma/client";
import { ColumnDefinition } from "../../tableDefinitions";

export const datasetItemsFilterCols: ColumnDefinition[] = [
  {
    name: "Dataset ID",
    id: "datasetId",
    type: "string",
    internal: "li.dataset_id",
  },
  {
    name: "Item ID",
    id: "id",
    type: "stringOptions",
    internal: "li.id",
    options: [],
  },
  {
    name: "Source Trace ID",
    id: "sourceTraceId",
    type: "string",
    internal: "li.source_trace_id",
  },
  {
    name: "Source Observation ID",
    id: "sourceObservationId",
    type: "string",
    internal: "li.source_observation_id",
  },
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: "li.status::text",
    options: Object.values(DatasetStatus).map((value) => ({ value })),
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: "li.metadata",
  },
  {
    name: "Created At",
    id: "createdAt",
    type: "datetime",
    internal: "li.created_at",
  },
];
