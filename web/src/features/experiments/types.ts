import { ZodModelConfig } from "@langfuse/shared";
import z from "zod";

type CreateExperimentValidationMessages = {
  experimentNameRequired: string;
  runNameRequired: string;
  promptRequired: string;
  datasetRequired: string;
  providerRequired: string;
  modelRequired: string;
};

export const createExperimentData = (
  messages: CreateExperimentValidationMessages,
) =>
  z.object({
    name: z
      .string()
      .min(1, messages.experimentNameRequired)
      .transform((str) => str.trim()),
    runName: z.string().min(1, messages.runNameRequired),
    promptId: z.string().min(1, messages.promptRequired),
    datasetId: z.string().min(1, messages.datasetRequired),
    datasetVersion: z.coerce.date().optional(),
    description: z.string().max(1000).optional(),
    modelConfig: z.object({
      provider: z.string().min(1, messages.providerRequired),
      model: z.string().min(1, messages.modelRequired),
      modelParams: ZodModelConfig,
    }),
    structuredOutputSchema: z.record(z.string(), z.unknown()).optional(),
  });

export type CreateExperiment = z.infer<ReturnType<typeof createExperimentData>>;
