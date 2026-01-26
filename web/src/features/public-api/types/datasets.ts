import {
  jsonSchema,
  publicApiPaginationZod,
  paginationZod,
  paginationMetaResponseZod,
  queryStringZod,
  versionZod,
  type DatasetRuns as DbDatasetRuns,
  type Dataset as DbDataset,
  removeObjectKeys,
  type DatasetRunItemDomain,
  type DatasetItemDomain,
} from "@langfuse/shared";
import { DatasetJSONSchema } from "@langfuse/shared/src/server";
import { z } from "zod/v4";

/**
 * Objects
 */

const APIDataset = z
  .object({
    id: z.string(),
    projectId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    metadata: z.any(),
    inputSchema: z.any().nullable(),
    expectedOutputSchema: z.any().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

const APIDatasetRun = z
  .object({
    datasetName: z.string(),
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    metadata: z.any(), // Assuming Prisma.JsonValue is any type
    datasetId: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

const APIDatasetRunItem = z
  .object({
    datasetRunName: z.string(),
    id: z.string(),
    datasetRunId: z.string(),
    datasetItemId: z.string(),
    traceId: z.string(),
    observationId: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export type APIDatasetRunItem = z.infer<typeof APIDatasetRunItem>;

const APIDatasetItem = z
  .object({
    datasetName: z.string(),
    id: z.string(),
    status: z.enum(["ACTIVE", "ARCHIVED"]),
    input: z.any(), // Assuming Prisma.JsonValue is any type
    expectedOutput: z.any(), // Assuming Prisma.JsonValue is any type
    metadata: z.any(), // Assuming Prisma.JsonValue is any type
    sourceTraceId: z.string().nullable(),
    sourceObservationId: z.string().nullable(),
    datasetId: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

/**
 * Transforms
 */

export const transformDbDatasetRunToAPIDatasetRun = (
  dbDatasetRun: DbDatasetRuns & { datasetName: string },
): z.infer<typeof APIDatasetRun> =>
  removeObjectKeys(dbDatasetRun, ["projectId"]);

export const transformDbDatasetItemDomainToAPIDatasetItem = (
  dbDatasetItem: DatasetItemDomain & {
    datasetName: string;
  },
): z.infer<typeof APIDatasetItem> =>
  removeObjectKeys(dbDatasetItem, ["projectId", "validFrom"]);

export const transformDbDatasetRunItemToAPIDatasetRunItemCh = (
  dbDatasetRunItem: DatasetRunItemDomain,
): z.infer<typeof APIDatasetRunItem> =>
  removeObjectKeys(dbDatasetRunItem, [
    "projectId",
    "datasetRunDescription",
    "datasetRunMetadata",
    "datasetRunCreatedAt",
    "datasetItemInput",
    "datasetItemExpectedOutput",
    "datasetItemMetadata",
    "datasetItemVersion",
    "datasetId",
    "error",
  ]);

export const transformDbDatasetToAPIDataset = (
  dataset: DbDataset,
): z.infer<typeof APIDataset> =>
  removeObjectKeys(dataset, ["remoteExperimentUrl", "remoteExperimentPayload"]);

/**
 * Endpoints
 */

// POST /v2/datasets
export const PostDatasetsV2Body = z.object({
  name: z.string(),
  description: z.string().nullish(),
  metadata: jsonSchema.nullish(),
  inputSchema: DatasetJSONSchema.nullish(),
  expectedOutputSchema: DatasetJSONSchema.nullish(),
});
export const PostDatasetsV2Response = APIDataset.strict();

// GET /v2/datasets
export const GetDatasetsV2Query = z.object({
  ...publicApiPaginationZod,
});
export const GetDatasetsV2Response = z
  .object({
    data: z.array(APIDataset),
    meta: paginationMetaResponseZod,
  })
  .strict();

// GET /v2/datasets/{datasetName}
export const GetDatasetV2Query = z.object({
  datasetName: queryStringZod,
});
export const GetDatasetV2Response = APIDataset.strict();

// GET /datasets/{name}/runs
export const GetDatasetRunsV1Query = z.object({
  name: queryStringZod, // dataset name from URL, name as it is v1
  ...publicApiPaginationZod,
});
export const GetDatasetRunsV1Response = z
  .object({
    data: z.array(APIDatasetRun),
    meta: paginationMetaResponseZod,
  })
  .strict();

// GET /datasets/{name}/runs/{runName}
export const GetDatasetRunV1Query = z.object({
  name: queryStringZod, // dataset name from URL, name as it is v1
  runName: queryStringZod,
});
export const GetDatasetRunV1Response = APIDatasetRun.extend({
  datasetRunItems: z.array(APIDatasetRunItem),
}).strict();

// POST /dataset-items
export const PostDatasetItemsV1Body = z.object({
  datasetName: z.string(),
  input: z.any().nullish(),
  expectedOutput: z.any().nullish(),
  metadata: z.any().nullish(),
  id: z.string().nullish(),
  sourceTraceId: z.string().nullish(),
  sourceObservationId: z.string().nullish(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).nullish(),
});
export const PostDatasetItemsV1Response = APIDatasetItem.strict();

// GET /dataset-items
export const GetDatasetItemsV1Query = z
  .object({
    datasetName: z.string().nullish(),
    sourceTraceId: z.string().nullish(),
    sourceObservationId: z.string().nullish(),
    version: versionZod.nullish(),
    ...publicApiPaginationZod,
  })
  .refine(
    (data) => {
      // If version is provided, datasetName must also be provided
      if (data.version && !data.datasetName) {
        return false;
      }
      return true;
    },
    {
      message: "datasetName is required when version parameter is provided",
      path: ["datasetName"],
    },
  );
export const GetDatasetItemsV1Response = z
  .object({
    data: z.array(APIDatasetItem),
    meta: paginationMetaResponseZod,
  })
  .strict();

// GET /dataset-items/{datasetItemId}
export const GetDatasetItemV1Query = z.object({
  datasetItemId: z.string(),
});
export const GetDatasetItemV1Response = APIDatasetItem.strict();

// DELETE /dataset-items/{datasetItemId}
export const DeleteDatasetItemV1Query = z.object({
  datasetItemId: z.string(),
});
export const DeleteDatasetItemV1Response = z
  .object({
    message: z.literal("Dataset item successfully deleted"),
  })
  .strict();

// POST /dataset-run-items
export const PostDatasetRunItemsV1Body = z
  .object({
    runName: z.string(),
    runDescription: z.string().nullish(),
    metadata: jsonSchema.nullish(),
    datasetItemId: z.string(),
    observationId: z.string().nullish(),
    traceId: z.string().nullish(),
    datasetVersion: versionZod.nullish(),
  })
  .strict()
  .refine((data) => data.observationId || data.traceId, {
    message: "observationId or traceId must be provided",
    path: ["observationId", "traceId"], // Specify the path of the error
  });
export const PostDatasetRunItemsV1Response = APIDatasetRunItem.strict();

// GET /dataset-run-items
export const GetDatasetRunItemsV1Query = z.object({
  datasetId: z.string(),
  runName: z.string(),
  ...publicApiPaginationZod,
});
export const GetDatasetRunItemsV1Response = z
  .object({
    data: z.array(APIDatasetRunItem),
    meta: paginationMetaResponseZod,
  })
  .strict();

/**
 * Deprecated endpoints replaced with v2, available for backward compatibility
 */

// POST /datasets
export const PostDatasetsV1Body = z.object({
  name: z.string(),
  description: z.string().nullish(),
  metadata: jsonSchema.nullish(),
  inputSchema: DatasetJSONSchema.nullish(),
  expectedOutputSchema: DatasetJSONSchema.nullish(),
});
export const PostDatasetsV1Response = APIDataset.extend({
  items: z.array(APIDatasetItem),
  runs: z.array(APIDatasetRun),
}).strict();

// GET /datasets
export const GetDatasetsV1Query = z.object({
  ...paginationZod,
});
export const GetDatasetsV1Response = z
  .object({
    data: z.array(
      APIDataset.extend({
        items: z.array(z.string()), // dataset item ids
        runs: z.array(z.string()), // dataset run names
      }),
    ),
    meta: paginationMetaResponseZod,
  })
  .strict();

// GET /datasets/{name}
export const GetDatasetV1Query = z.object({
  name: queryStringZod,
});
export const GetDatasetV1Response = APIDataset.extend({
  items: z.array(APIDatasetItem),
  runs: z.array(z.string()), // dataset run names
}).strict();

// DELETE /datasets/{name}/runs/{runName}
export const DeleteDatasetRunV1Query = z.object({
  name: queryStringZod, // dataset name from URL
  runName: queryStringZod,
});
export const DeleteDatasetRunV1Response = z
  .object({
    message: z.literal("Dataset run successfully deleted"),
  })
  .strict();
