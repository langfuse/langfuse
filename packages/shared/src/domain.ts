import z from "zod";
import { jsonSchema, jsonSchemaNullable } from "./utils/zod";

const MetadataDomain = z.record(
  z.string(),
  jsonSchemaNullable.or(z.undefined()),
);

// to be used across the application in frontend and backend.
export const TraceDomain = z.object({
  id: z.string(),
  name: z.string().nullable(),
  timestamp: z.date(),
  environment: z.string(),
  tags: z.array(z.string()),
  bookmarked: z.boolean(),
  public: z.boolean(),
  release: z.string().nullable(),
  version: z.string().nullable(),
  input: jsonSchema.nullable(),
  output: jsonSchema.nullable(),
  metadata: MetadataDomain,
  createdAt: z.date(),
  updatedAt: z.date(),
  sessionId: z.string().nullable(),
  userId: z.string().nullable(),
  projectId: z.string(),
});

export type TraceDomain = z.infer<typeof TraceDomain>;

export const ObservationType = {
  SPAN: "SPAN",
  EVENT: "EVENT",
  GENERATION: "GENERATION",
} as const;
export const ObservationTypeDomain = z.enum(["SPAN", "EVENT", "GENERATION"]);
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
  inputUsage: z.number().nullable(),
  outputUsage: z.number().nullable(),
  totalUsage: z.number().nullable(),
});

export type Observation = z.infer<typeof ObservationSchema>;
