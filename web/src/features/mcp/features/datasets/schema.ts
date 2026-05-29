import { z } from "zod";
import {
  publicApiPaginationZod,
  versionZod,
  type JSONValue,
} from "@langfuse/shared";
import {
  DeleteDatasetRunV1Query,
  GetDatasetRunItemsV1Query,
  GetDatasetRunV1Query,
  GetDatasetRunsV1Query,
  GetDatasetsV2Query,
  GetDatasetV2Query,
  PostDatasetItemsV1Body,
} from "@/src/features/public-api/types/datasets";

export const resolveMetadata = (
  metadata: JSONValue,
): Record<string, unknown> => {
  if (Array.isArray(metadata)) {
    return { metadata };
  }
  if (typeof metadata === "object" && metadata !== null) {
    return metadata as Record<string, unknown>;
  }
  return { metadata };
};

export const GetDatasetsMcpInput = GetDatasetsV2Query.extend({
  name: z.string().optional(),
});

export const GetDatasetMcpInput = GetDatasetV2Query.omit({
  datasetName: true,
}).extend({
  datasetId: z.string(),
});

export const GetDatasetRunsMcpInput = GetDatasetRunsV1Query.omit({
  name: true,
}).extend({
  datasetId: z.string(),
});

export const GetDatasetRunMcpInput = GetDatasetRunV1Query.omit({
  name: true,
  runName: true,
}).extend({
  datasetId: z.string(),
  datasetRunId: z.string(),
});

export const DeleteDatasetRunMcpInput = DeleteDatasetRunV1Query.omit({
  name: true,
  runName: true,
}).extend({
  datasetId: z.string(),
  datasetRunId: z.string(),
});

export const GetDatasetRunItemsMcpInput = GetDatasetRunItemsV1Query.omit({
  runName: true,
}).extend({
  datasetRunId: z.string(),
});

export const GetDatasetItemsMcpInput = z
  .object({
    datasetId: z.string().optional(),
    sourceTraceId: z.string().nullish(),
    sourceObservationId: z.string().nullish(),
    version: versionZod.nullish(),
    ...publicApiPaginationZod,
  })
  .refine(
    (data) => {
      if (data.version && !data.datasetId) return false;
      return true;
    },
    {
      message: "datasetId is required when version parameter is provided",
      path: ["datasetId"],
    },
  );

export const PostDatasetItemMcpInput = PostDatasetItemsV1Body.omit({
  datasetName: true,
}).extend({
  datasetId: z.string(),
});
