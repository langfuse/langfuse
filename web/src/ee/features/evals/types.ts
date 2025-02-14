import { z } from "zod";
import { JobTimeScope } from "@langfuse/shared";

export enum EvalReferencedEvaluators {
  UPDATE = "update",
  PERSIST = "persist",
}

export const EvaluatorStatus = JobTimeScope;
export const EvaluatorStatusSchema = z.nativeEnum(EvaluatorStatus);
export type EvaluatorStatusType = z.infer<typeof EvaluatorStatusSchema>;
