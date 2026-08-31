import { JobConfigState, type JobConfiguration } from "@langfuse/shared";

export const EvaluatorStatus = JobConfigState;

export type PartialConfig = Pick<
  JobConfiguration,
  | "scoreName"
  | "targetObject"
  | "filter"
  | "variableMapping"
  | "sampling"
  | "delay"
  | "timeScope"
  | "status"
> & { id?: string };

export const RAGAS_TEMPLATE_PREFIX = "__ragas__";
