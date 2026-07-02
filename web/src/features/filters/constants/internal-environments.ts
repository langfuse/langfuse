import { LangfuseInternalTraceEnvironment } from "@langfuse/shared";

export const DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS = [
  LangfuseInternalTraceEnvironment.PromptExperiments,
  LangfuseInternalTraceEnvironment.LLMJudge,
  LangfuseInternalTraceEnvironment.CodeEval,
  LangfuseInternalTraceEnvironment.NaturalLanguageFilter,
  "langfuse-evaluation",
  "sdk-experiment",
] as const;

// Environments in which experiment-enriched events live: the SDKs (JS >= 5,
// Python >= 3.9) stamp `sdk-experiment` together with the experiment fields
// on every in-process span of an experiment run, and UI prompt experiments
// write enriched events in `langfuse-prompt-experiment`. Hiding these while
// an experiment filter is active would make the filter unsatisfiable
// (LFE-10644), so the managed environment policy reveals them when the user
// filters by experiment.
export const EXPERIMENT_ENVIRONMENTS = [
  "sdk-experiment",
  LangfuseInternalTraceEnvironment.PromptExperiments,
] as const;

// Events-table experiment filter columns, in both id and display-name form
// (filter state may carry either). Kept in sync with
// `eventsTableCols` — see the parity test in
// ../lib/managedEnvironmentPolicy.clienttest.ts.
export const EXPERIMENT_FILTER_COLUMNS = [
  "experimentId",
  "Experiment ID",
  "experimentName",
  "Experiment Name",
  "experimentDatasetId",
  "Experiment Dataset ID",
] as const;

export const DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG = {
  hiddenEnvironments: DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS,
  experimentFilterColumns: EXPERIMENT_FILTER_COLUMNS,
  experimentEnvironments: EXPERIMENT_ENVIRONMENTS,
} as const;
