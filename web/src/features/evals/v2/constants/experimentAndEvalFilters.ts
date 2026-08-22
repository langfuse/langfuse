import type { FilterState } from "@langfuse/shared";

export const EXPERIMENTS_AND_EVALS_EXCLUSION_FILTERS = [
  {
    column: "environment",
    type: "string",
    operator: "does not contain",
    value: "langfuse-",
  },
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
