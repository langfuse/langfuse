import {
  jsonSchema,
  MetadataDomain,
  Observation,
  ObservationLevelDomain,
  ObservationTypeDomain,
} from "@langfuse/shared";
import {
  getActionConfigById,
  getObservationById,
  WebhookInput,
} from "@langfuse/shared/src/server";
import { z } from "zod";

export const ObservationWebhookOutputSchema = z.object({
  id: z.string(),
  traceId: z.string().nullable(),
  projectId: z.string(),
  environment: z.string(),
  type: ObservationTypeDomain,
  startTime: z.date(),
  endTime: z.date().nullable(),
  name: z.string().nullable(),
  metadata: MetadataDomain,
  parentObservationId: z.string().nullable(),
  level: ObservationLevelDomain,
  statusMessage: z.string().nullable(),
  version: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  model: z.string().nullable(),
  internalModelId: z.string().nullable(),
  modelParameters: jsonSchema.nullable(),
  input: jsonSchema.nullable(),
  output: jsonSchema.nullable(),
  completionStartTime: z.date().nullable(),
  promptId: z.string().nullable(),
  promptName: z.string().nullable(),
  promptVersion: z.number().nullable(),
  latency: z.number().nullable(),
  timeToFirstToken: z.number().nullable(),
  usageDetails: z.record(z.string(), z.number()),
  costDetails: z.record(z.string(), z.number()),
  providedCostDetails: z.record(z.string(), z.number()),
  // aggregated data from cost_details
  inputCost: z.number().nullable(),
  outputCost: z.number().nullable(),
  totalCost: z.number().nullable(),
  // aggregated data from usage_details
  inputUsage: z.number(),
  outputUsage: z.number(),
  totalUsage: z.number(),
});

export type ObservationWebhookOutput = z.infer<
  typeof ObservationWebhookOutputSchema
>;

const convertObservationToWebhookOutput = (
  observation: Observation,
): ObservationWebhookOutput => {
  return observation;
};

export const executeWebhook = async (input: WebhookInput) => {
  const { observationId, projectId, startTime, observationType, actionId } =
    input;

  const observation = await getObservationById({
    id: observationId,
    projectId,
    fetchWithInputOutput: true,
    startTime,
    type: observationType,
  });

  if (!observation) {
    throw new Error("Observation not found");
  }

  const reqBody = convertObservationToWebhookOutput(observation);

  const actionConfig = await getActionConfigById({
    projectId,
    actionId,
  });

  if (!actionConfig) {
    throw new Error("Action config not found");
  }

  await fetch(actionConfig.config.url, {
    method: "POST",
    body: JSON.stringify(reqBody),
    headers: actionConfig.config.headers,
  });
};
