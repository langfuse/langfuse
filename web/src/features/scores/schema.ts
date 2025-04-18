import { ScoreDataType } from "@langfuse/shared";
import { z } from "zod";

export const AnnotationScoreDataSchema = z.object({
  name: z.string(),
  scoreId: z.string().optional(),
  value: z.number().nullable().optional(),
  stringValue: z.string().optional(),
  dataType: z.nativeEnum(ScoreDataType),
  configId: z.string().optional(),
  comment: z.string().optional(),
});

export const AnnotateFormSchema = z.object({
  scoreData: z.array(AnnotationScoreDataSchema),
});
