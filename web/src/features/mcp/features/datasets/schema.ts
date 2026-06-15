import { z } from "zod";
import { type JSONValue } from "@langfuse/shared";
import { publicApiIdSchema } from "@/src/features/public-api/types/datasets";

const paginationSchema = {
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
};

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

export const GetDatasetsMcpInput = z.object({
  name: z.string().optional(),
  ...paginationSchema,
});

export const GetDatasetMcpInput = z.object({
  datasetId: z.string(),
});

export const GetDatasetRunsMcpInput = z.object({
  datasetId: z.string(),
  ...paginationSchema,
});

export const GetDatasetRunMcpInput = z.object({
  datasetId: z.string(),
  datasetRunId: z.string(),
});

export const DeleteDatasetRunMcpInput = z.object({
  datasetId: z.string(),
  datasetRunId: z.string(),
});

export const GetDatasetRunItemsMcpInput = z.object({
  datasetId: z.string(),
  datasetRunId: z.string(),
  ...paginationSchema,
});

const GetDatasetItemsMcpBaseInput = z.object({
  datasetId: z.string().optional(),
  sourceTraceId: z.string().optional(),
  sourceObservationId: z.string().optional(),
  version: z.string().optional(),
  ...paginationSchema,
});

const GetDatasetItemsMcpRuntimeInput = GetDatasetItemsMcpBaseInput.extend({
  version: z.coerce.date().optional(),
});

export const GetDatasetItemsMcpInput = GetDatasetItemsMcpRuntimeInput.refine(
  (data) => {
    if (data.version && !data.datasetId) return false;
    return true;
  },
  {
    message: "datasetId is required when version parameter is provided",
    path: ["datasetId"],
  },
);

export const PostDatasetItemMcpInput = z.object({
  datasetId: z.string(),
  input: z.any().optional(),
  expectedOutput: z.any().optional(),
  metadata: z.any().optional(),
  id: publicApiIdSchema.optional(),
  sourceTraceId: z.string().optional(),
  sourceObservationId: z.string().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const GetDatasetItemsMcpBaseSchema = GetDatasetItemsMcpBaseInput;
