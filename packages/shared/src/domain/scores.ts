import z from "zod";
import { MetadataDomain } from "./traces";

export const ScoreSource = {
  ANNOTATION: "ANNOTATION",
  API: "API",
  EVAL: "EVAL",
} as const;
export const ScoreSourceDomain = z.enum(["ANNOTATION", "API", "EVAL"]);
export type ScoreSourceType = z.infer<typeof ScoreSourceDomain>;

const ScoreSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  projectId: z.string(),
  environment: z.string(),
  name: z.string(),
  source: ScoreSourceDomain,
  authorUserId: z.string().nullish(),
  comment: z.string().nullish(),
  metadata: MetadataDomain,
  configId: z.string().nullish(),
  queueId: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
  traceId: z.string().nullish(),
  observationId: z.string().nullish(),
  sessionId: z.string().nullish(),
  value: z.number().nullish(),
  stringValue: z.string().nullish(),
  dataType: z.enum(["NUMERIC", "CATEGORICAL", "BOOLEAN"]),
});

export type ScoreDomain = z.infer<typeof ScoreSchema>;
