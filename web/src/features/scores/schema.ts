import { ANNOTATION_SCORE_DATA_TYPES_ARRAY } from "@/src/features/scores/types";
import { z } from "zod/v4";

export const AnnotationScoreDataSchema = z.object({
  // Required for ClickHouse deduplication (not shown in UI)
  id: z.string().nullish(),
  timestamp: z.date().nullish(),
  // Required for score writes (shown in UI)
  name: z.string(),
  value: z.number().nullish(),
  stringValue: z.string().nullish(),
  dataType: z.enum(ANNOTATION_SCORE_DATA_TYPES_ARRAY),
  configId: z.string(),
  comment: z.string().nullish(),
});

export const AnnotateFormSchema = z.object({
  scoreData: z.array(AnnotationScoreDataSchema),
});
