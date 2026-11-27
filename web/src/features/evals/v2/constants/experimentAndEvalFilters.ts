import {
  LangfuseInternalTraceEnvironment,
  PUBLIC_INTERNAL_EVAL_ENVIRONMENTS,
  type FilterState,
} from "@langfuse/shared";

export const INTERNAL_EVALUATION_ENVIRONMENTS = [
  ...Object.values(LangfuseInternalTraceEnvironment),
  "langfuse-topics",
  "langfuse-evaluation",
  "langfuse",
  ...PUBLIC_INTERNAL_EVAL_ENVIRONMENTS,
] as const;

export const INTERNAL_EVALUATION_ENVIRONMENT_FILTERS = [
  {
    column: "environment",
    type: "stringOptions",
    operator: "none of",
    value: [...INTERNAL_EVALUATION_ENVIRONMENTS],
  },
] satisfies FilterState;
