import { ScoreDataType } from "@langfuse/shared";
import { z } from "zod/v4";

export const AnnotationScoreDataSchema = z.object({
  name: z.string(),
  // TODO: better comment, null means score is aggregate
  scoreId: z.string().nullish(),
  value: z.number().nullable().optional(),
  stringValue: z.string().optional(),
  dataType: z.enum(ScoreDataType),
  configId: z.string().optional(),
  comment: z.string().optional(),
});

export const AnnotateFormSchema = z.object({
  scoreData: z.array(AnnotationScoreDataSchema),
});
