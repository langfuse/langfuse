import { z } from "zod";
import type { JSONValue } from "@langfuse/shared";
import {
  DeleteDatasetRunV1Query,
  GetDatasetRunV1Query,
  GetDatasetRunsV1Query,
  GetDatasetV2Query,
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

export const GetDatasetMcpInput = GetDatasetV2Query.extend({
  datasetName: z.string(),
});

export const GetDatasetRunsMcpInput = GetDatasetRunsV1Query.extend({
  name: z.string(),
});

export const GetDatasetRunMcpInput = GetDatasetRunV1Query.extend({
  name: z.string(),
  runName: z.string(),
});

export const DeleteDatasetRunMcpInput = DeleteDatasetRunV1Query.extend({
  name: z.string(),
  runName: z.string(),
});
