import { z } from "zod";
import { JobConfigState, type JobConfiguration } from "@langfuse/shared";

export enum EvalReferencedEvaluators {
  UPDATE = "update",
  PERSIST = "persist",
}

export const EvaluatorStatus = JobConfigState;
export const EvaluatorStatusSchema = z.nativeEnum(EvaluatorStatus);
export type EvaluatorStatusType = z.infer<typeof EvaluatorStatusSchema>;

export type PartialConfig = Pick<
  JobConfiguration,
  | "scoreName"
  | "targetObject"
  | "filter"
  | "variableMapping"
  | "sampling"
  | "delay"
  | "timeScope"
> & { id?: string };

export const RAGAS_TEMPLATE_PREFIX = "__ragas__";
