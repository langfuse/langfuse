import { ZodModelConfig } from "@langfuse/shared";
import z from "zod/v4";

export const CreateExperimentData = z.object({
  name: z
    .string()
    .min(1, "Please enter an experiment name")
    .transform((str) => str.trim()),
  runName: z.string().min(1, "Run name is required"),
  promptId: z.string().min(1, "Please select a prompt"),
  datasetId: z.string().min(1, "Please select a dataset"),
  datasetVersion: z.coerce.date().optional(),
  description: z.string().max(1000).optional(),
  modelConfig: z.object({
    provider: z.string().min(1, "Please select a provider"),
    model: z.string().min(1, "Please select a model"),
    modelParams: ZodModelConfig,
  }),
  structuredOutputSchema: z.record(z.string(), z.unknown()).optional(),
});

export type CreateExperiment = z.infer<typeof CreateExperimentData>;
