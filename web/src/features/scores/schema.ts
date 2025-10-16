import { ScoreDataType } from "@langfuse/shared";
import { z } from "zod/v4";

// TODO: review form schema
export const AnnotationScoreDataSchema = z.object({
  name: z.string(),
  id: z.string().nullish(),
  value: z.number().nullish(),
  stringValue: z.string().nullish(),
  dataType: z.enum(ScoreDataType),
  configId: z.string(),
  comment: z.string().nullish(),
});

export const AnnotateFormSchema = z.object({
  scoreData: z.array(AnnotationScoreDataSchema),
});
