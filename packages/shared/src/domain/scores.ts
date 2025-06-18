import { ScoreDataType } from "@prisma/client";
import z from "zod/v4";
import { MetadataDomain } from "./traces";

export const ScoreSource = {
  ANNOTATION: "ANNOTATION",
  API: "API",
  EVAL: "EVAL",
} as const;

export const ScoreSourceDomain = z.enum(["ANNOTATION", "API", "EVAL"]);
export type ScoreSourceType = z.infer<typeof ScoreSourceDomain>;

export const ScoreSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  projectId: z.string(),
  environment: z.string(),
  name: z.string(),
  value: z.number().nullable(),
  source: ScoreSourceDomain,
  authorUserId: z.string().nullable(),
  comment: z.string().nullable(),
  traceId: z.string().nullable(),
  sessionId: z.string().nullable(),
  datasetRunId: z.string().nullable(),
  metadata: MetadataDomain,
  observationId: z.string().nullable(),
  configId: z.string().nullable(),
  stringValue: z.string().nullable(),
  queueId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  dataType: z.enum(ScoreDataType),
});

export type ScoreDomain = z.infer<typeof ScoreSchema>;
