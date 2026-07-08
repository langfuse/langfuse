import { DatasetStatus } from "@prisma/client";
import { ColumnDefinition } from "../../tableDefinitions";

export const datasetItemsFilterCols: ColumnDefinition[] = [
  {
    name: "Dataset ID",
    id: "datasetId",
    type: "stringOptions",
    internal: "di.dataset_id",
    options: [],
  },
  {
    name: "Item ID",
    id: "id",
    type: "stringOptions",
    internal: "di.id",
    options: [],
  },
  {
    name: "Source Trace ID",
    id: "sourceTraceId",
    type: "string",
    internal: "di.source_trace_id",
  },
  {
    name: "Source Observation ID",
    id: "sourceObservationId",
    type: "string",
    internal: "di.source_observation_id",
  },
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: "di.status::text",
    options: Object.values(DatasetStatus).map((value) => ({ value })),
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: "di.metadata",
  },
  {
    name: "Created At",
    id: "createdAt",
    type: "datetime",
    internal: "di.created_at",
  },
  {
    name: "Valid From",
    id: "validFrom",
    type: "datetime",
    internal: "di.valid_from",
  },
];
