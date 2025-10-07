import { ScoreDataType } from "@langfuse/shared";
import { z } from "zod/v4";

export const AnnotationScoreDataSchema = z.object({
  name: z.string(),
  scoreId: z.string().optional(),
  value: z.number().nullable().optional(),
  stringValue: z.string().optional(),
  dataType: z.enum(ScoreDataType),
  configId: z.string().optional(),
  comment: z.string().optional(),
});

export const AnnotateFormSchema = z.object({
  scoreData: z.array(AnnotationScoreDataSchema),
});
