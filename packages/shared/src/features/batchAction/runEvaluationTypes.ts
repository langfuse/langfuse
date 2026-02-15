import z from "zod/v4";

export const ObservationRunEvaluationEvaluatorSchema = z.object({
  evaluatorConfigId: z.string(),
  evaluatorName: z.string().min(1),
});

export const ObservationRunEvaluationConfigSchema = z.object({
  evaluators: z.array(ObservationRunEvaluationEvaluatorSchema).min(1),
});

export type ObservationRunEvaluationEvaluator = z.infer<
  typeof ObservationRunEvaluationEvaluatorSchema
>;
export type ObservationRunEvaluationConfig = z.infer<
  typeof ObservationRunEvaluationConfigSchema
>;
