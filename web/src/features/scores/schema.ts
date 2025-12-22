import { z } from "zod/v4";

export const AnnotationScoreDataSchema = z.object({
  // Required for ClickHouse deduplication (not shown in UI)
  id: z.string().nullish(),
  timestamp: z.date().nullish(),
  // Required for score writes (shown in UI)
  name: z.string(),
  value: z.number().nullish(),
  stringValue: z.string().nullish(),
  dataType: z.enum(["CATEGORICAL", "NUMERIC", "BOOLEAN"]),
  configId: z.string(),
  comment: z.string().nullish(),
});

export const AnnotateFormSchema = z.object({
  scoreData: z.array(AnnotationScoreDataSchema),
});
