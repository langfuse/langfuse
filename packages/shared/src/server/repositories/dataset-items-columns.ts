import { DatasetStatus } from "@prisma/client";
import { ColumnDefinition } from "../../tableDefinitions";

export const datasetItemsFilterCols: ColumnDefinition[] = [
  {
    name: "Dataset ID",
    id: "datasetId",
    type: "string",
    internal: "le.dataset_id",
  },
  {
    name: "Item ID",
    id: "id",
    type: "stringOptions",
    internal: "le.id",
    options: [],
  },
  {
    name: "Source Trace ID",
    id: "sourceTraceId",
    type: "string",
    internal: "le.source_trace_id",
  },
  {
    name: "Source Observation ID",
    id: "sourceObservationId",
    type: "string",
    internal: "le.source_observation_id",
  },
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: "le.status::text",
    options: Object.values(DatasetStatus).map((value) => ({ value })),
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: "le.metadata",
  },
];
