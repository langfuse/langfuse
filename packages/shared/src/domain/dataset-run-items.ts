import z from "zod/v4";
import { jsonSchema } from "../utils/zod";

export const DatasetRunItemSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  observationId: z.string().nullable(),
  projectId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  datasetRunId: z.string(),
  datasetItemId: z.string(),
  error: z.string().nullable(),
  // dataset run fields
  datasetRunName: z.string(),
  datasetRunDescription: z.string().nullable(),
  datasetRunMetadata: jsonSchema.nullable(),
  datasetRunCreatedAt: z.date(),
  // dataset item fields
  datasetItemInput: jsonSchema.nullable(),
  datasetItemExpectedOutput: jsonSchema.nullable(),
  // TODO: output would be EPIC, let's see if we can make this work
  datasetId: z.string(),
});

export type DatasetRunItemDomain = z.infer<typeof DatasetRunItemSchema>;
