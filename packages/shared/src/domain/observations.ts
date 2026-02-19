import z from "zod/v4";
import { jsonSchema } from "../utils/zod";
import { MetadataDomain } from "./traces";

export const ObservationType = {
  SPAN: "SPAN",
  EVENT: "EVENT",
  GENERATION: "GENERATION",
  AGENT: "AGENT",
  TOOL: "TOOL",
  CHAIN: "CHAIN",
  RETRIEVER: "RETRIEVER",
  EVALUATOR: "EVALUATOR",
  EMBEDDING: "EMBEDDING",
  GUARDRAIL: "GUARDRAIL",
} as const;

export const ObservationTypeDomain = z.enum([
  "SPAN",
  "EVENT",
  "GENERATION",
  "AGENT",
  "TOOL",
  "CHAIN",
  "RETRIEVER",
  "EVALUATOR",
  "EMBEDDING",
  "GUARDRAIL",
]);
export type ObservationType = z.infer<typeof ObservationTypeDomain>;

export const ObservationLevel = {
  DEBUG: "DEBUG",
  DEFAULT: "DEFAULT",
  WARNING: "WARNING",
  ERROR: "ERROR",
} as const;
export const ObservationLevelDomain = z.enum([
  "DEBUG",
  "DEFAULT",
  "WARNING",
  "ERROR",
]);
export type ObservationLevelType = z.infer<typeof ObservationLevelDomain>;

export const ObservationDomain = z.object({
  id: z.string(),
  name: z.string(),
  timestamp: z.date(),
  environment: z.string(),
  tags: z.array(z.string()),
});
export type ObservationDomain = z.infer<typeof ObservationDomain>;

export const ObservationSchema = z.object({
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
  // pricing tier information
  usagePricingTierId: z.string().nullable(),
  usagePricingTierName: z.string().nullable(),
  // tool data
  toolDefinitions: z.record(z.string(), z.string()).nullable(),
  toolCalls: z.array(z.string()).nullable(),
  toolCallNames: z.array(z.string()).nullable(),
});

export type Observation = z.infer<typeof ObservationSchema>;

export type ObservationCoreFields = Pick<
  Observation,
  "id" | "traceId" | "startTime" | "projectId" | "parentObservationId"
>;

export const EventsObservationSchema = ObservationSchema.extend({
  userId: z.string().nullable(),
  sessionId: z.string().nullable(),
  traceName: z.string().nullable(),
});

export type EventsObservation = z.infer<typeof EventsObservationSchema>;

export type PartialObservation = Partial<Observation> & ObservationCoreFields;

export type PartialEventsObservation = Partial<EventsObservation> &
  ObservationCoreFields;

/**
 * Returns true if an observation type is generation-like, meaning it could include LLM calls
 * and potentially has similar input/output fields.
 */
const GenerationLikeObservationTypes = [
  ObservationType.GENERATION,
  ObservationType.AGENT,
  ObservationType.TOOL,
  ObservationType.CHAIN,
  ObservationType.RETRIEVER,
  ObservationType.EVALUATOR,
  ObservationType.EMBEDDING,
  ObservationType.GUARDRAIL,
] as const;

export const isGenerationLike = (observationType: ObservationType): boolean => {
  return GenerationLikeObservationTypes.includes(observationType as any);
};

/**
 * Returns all generation-like observation types for use in filters and queries.
 */
export const getGenerationLikeTypes = (): ObservationType[] => {
  return [...GenerationLikeObservationTypes];
};
