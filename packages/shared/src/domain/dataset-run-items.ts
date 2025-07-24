import z from "zod/v4";
import { jsonSchema } from "../utils/zod";
import { MetadataDomain } from "./traces";

export const DatasetRunItemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  datasetRunId: z.string(),
  datasetItemId: z.string(),
  datasetId: z.string(),
  traceId: z.string(),
  observationId: z.string().nullable(),
  error: z.string().nullable(),
  // timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
  // dataset run fields
  datasetRunName: z.string(),
  datasetRunDescription: z.string().nullable(),
  datasetRunMetadata: MetadataDomain,
  datasetRunCreatedAt: z.date(),
  // dataset item fields
  datasetItemInput: jsonSchema,
  datasetItemExpectedOutput: jsonSchema,
  datasetItemMetadata: MetadataDomain,
});

export type DatasetRunItemDomain = z.infer<typeof DatasetRunItemSchema>;
