import {
  LangfuseInternalTraceEnvironment,
  type FilterState,
} from "@langfuse/shared";

export const INTERNAL_EVALUATION_ENVIRONMENTS = [
  ...Object.values(LangfuseInternalTraceEnvironment),
  "langfuse-evaluation",
  "langfuse",
  "llm-as-a-judge",
] as const;

export const INTERNAL_EVALUATION_ENVIRONMENT_FILTERS = [
  {
    column: "environment",
    type: "stringOptions",
    operator: "none of",
    value: [...INTERNAL_EVALUATION_ENVIRONMENTS],
  },
] satisfies FilterState;

export const EXPERIMENTS_AND_EVALS_EXCLUSION_FILTERS = [
  ...INTERNAL_EVALUATION_ENVIRONMENT_FILTERS,
  {
    column: "environment",
    type: "stringOptions",
    operator: "none of",
    value: ["sdk-experiment"],
  },
  {
    column: "experimentId",
    type: "null",
    operator: "is null",
    value: "",
  },
] satisfies FilterState;
