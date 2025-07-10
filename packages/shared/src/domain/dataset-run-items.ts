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
  datasetRunName: z.string(),
  datasetRunDescription: z.string().nullable(),
  datasetRunMetadata: jsonSchema.nullable(),
  datasetItemInput: jsonSchema.nullable(),
  datasetItemExpectedOutput: jsonSchema.nullable(),
});

export type DatasetRunItemDomain = z.infer<typeof DatasetRunItemSchema>;
