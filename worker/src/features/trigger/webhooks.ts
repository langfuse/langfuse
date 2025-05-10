import {
  jsonSchema,
  MetadataDomain,
  Observation,
  ObservationLevelDomain,
  ObservationTypeDomain,
} from "@langfuse/shared";
import { getObservationById } from "@langfuse/shared/src/server";
import { z } from "zod";
import { getActionConfigById } from "./action-repository";

export const WebhookInputSchema = z.discriminatedUnion("type", [
  z.object({
    observationId: z.string(),
    type: z.literal("observation"),
    startTime: z.date(),
    traceId: z.string(),
    observationType: ObservationTypeDomain,
    }),
  ])
  .and(
    z.object({
      projectId: z.string(),
      actionId: z.string(),
    }),
  );

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

export type WebhookInput = z.infer<typeof WebhookInputSchema>;

const convertObservationToWebhookOutput = (
  observation: Observation,
): ObservationWebhookOutput => {
  return observation;
};

export const executeWebhook = async (input: WebhookInput) => {
  const { observationId, projectId, startTime, traceId, observationType } =
    input;

  const observation = await getObservationById(
    observationId,
    projectId,
    true,
    startTime,
  );

  if (!observation) {
    throw new Error("Observation not found");
  }

  const reqBody = convertObservationToWebhookOutput(observation);

  const actionConfig = await getActionConfigById({
    projectId,
    actionId,
  });

  if (!actionConfig) {
};


