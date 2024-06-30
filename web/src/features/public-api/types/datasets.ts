import {
  jsonSchema,
  paginationZod,
  paginationMetaResponseZod,
  queryStringZod,
} from "@langfuse/shared";
import { z } from "zod";

const Dataset = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  metadata: z.any(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const DatasetRun = z.object({
  datasetName: z.string(),
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  metadata: z.any(), // Assuming Prisma.JsonValue is any type
  datasetId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const DatasetRunItem = z.object({
  datasetRunName: z.string(),
  id: z.string(),
  datasetRunId: z.string(),
  datasetItemId: z.string(),
  traceId: z.string(),
  observationId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const DatasetItem = z.object({
  datasetName: z.string(),
  id: z.string(),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  input: z.any(), // Assuming Prisma.JsonValue is any type
  expectedOutput: z.any(), // Assuming Prisma.JsonValue is any type
  metadata: z.any(), // Assuming Prisma.JsonValue is any type
  sourceTraceId: z.string().nullable(),
  sourceObservationId: z.string().nullable(),
  datasetId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// POST /v2/datasets
export const PostDatasetsV2Body = z.object({
  name: z.string(),
  description: z.string().nullish(),
  metadata: jsonSchema.nullish(),
});
export const PostDatasetsV2Response = Dataset;

// GET /v2/datasets
export const GetDatasetsV2Query = z.object({
  ...paginationZod,
});
export const GetDatasetsV2Response = z.object({
  data: z.array(Dataset),
  meta: paginationMetaResponseZod,
});

// GET /v2/datasets/{datasetName}
export const GetDatasetV2Query = z.object({
  datasetName: queryStringZod,
});
export const GetDatasetV2Response = Dataset;

// GET /datasets/{name}/runs
export const GetDatasetRunsV1Query = z.object({
  name: queryStringZod, // dataset name from URL, name as it is v1
  ...paginationZod,
});
export const GetDatasetRunsV1Response = z.object({
  data: z.array(DatasetRun),
  meta: paginationMetaResponseZod,
});

// GET /datasets/{name}/runs/{runName}
export const GetDatasetRunV1Query = z.object({
  name: queryStringZod, // dataset name from URL, name as it is v1
  runName: queryStringZod,
});
export const GetDatasetRunV1Response = DatasetRun.extend({
  datasetRunItems: z.array(DatasetRunItem),
});

// POST /dataset-items
export const PostDatasetItemsV1Body = z.object({
  datasetName: z.string(),
  input: jsonSchema.nullish(),
  expectedOutput: jsonSchema.nullish(),
  metadata: jsonSchema.nullish(),
  id: z.string().nullish(),
  sourceTraceId: z.string().nullish(),
  sourceObservationId: z.string().nullish(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).nullish(),
});
export const PostDatasetItemsV1Response = DatasetItem;

// GET /dataset-items
export const GetDatasetItemsV1Query = z.object({
  datasetName: z.string().nullish(),
  sourceTraceId: z.string().nullish(),
  sourceObservationId: z.string().nullish(),
  ...paginationZod,
});
export const GetDatasetItemsV1Response = z.object({
  data: z.array(DatasetItem),
  meta: paginationMetaResponseZod,
});

// GET /dataset-items/{datasetItemId}
export const GetDatasetItemV1Query = z.object({
  datasetItemId: z.string(),
});
export const GetDatasetItemV1Response = DatasetItem;
