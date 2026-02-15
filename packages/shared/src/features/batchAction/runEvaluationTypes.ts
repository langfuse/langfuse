import z from "zod/v4";

export const ObservationBatchEvaluationEvaluatorSchema = z.object({
  evaluatorConfigId: z.string(),
  evaluatorName: z.string().min(1),
});

export const ObservationBatchEvaluationConfigSchema = z.object({
  evaluators: z.array(ObservationBatchEvaluationEvaluatorSchema).min(1),
});

export type ObservationBatchEvaluationEvaluator = z.infer<
  typeof ObservationBatchEvaluationEvaluatorSchema
>;
export type ObservationBatchEvaluationConfig = z.infer<
  typeof ObservationBatchEvaluationConfigSchema
>;
