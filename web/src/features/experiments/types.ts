import { ZodModelConfig } from "@langfuse/shared";
import z from "zod/v4";

export const CreateExperimentData = z.object({
  name: z
    .union([z.string().length(0), z.string().min(1)])
    .optional()
    .transform((str) => str?.trim())
    .transform((str) => (str === "" ? undefined : str)),
  promptId: z.string().min(1, "Please select a prompt"),
  datasetId: z.string().min(1, "Please select a dataset"),
  description: z.string().max(1000).optional(),
  modelConfig: z.object({
    provider: z.string().min(1, "Please select a provider"),
    model: z.string().min(1, "Please select a model"),
    modelParams: ZodModelConfig,
  }),
  structuredOutputSchema: z.record(z.string(), z.unknown()).optional(),
});

export type CreateExperiment = z.infer<typeof CreateExperimentData>;
