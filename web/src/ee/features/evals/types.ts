import { z } from "zod";
import { JobConfigState } from "@langfuse/shared";

export enum EvalReferencedEvaluators {
  UPDATE = "update",
  PERSIST = "persist",
}

export const EvaluatorStatus = JobConfigState;
export const EvaluatorStatusSchema = z.nativeEnum(EvaluatorStatus);
export type EvaluatorStatusType = z.infer<typeof EvaluatorStatusSchema>;
