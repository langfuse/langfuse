import { LangfuseInternalTraceEnvironment } from "@langfuse/shared";

export const DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS = [
  LangfuseInternalTraceEnvironment.PromptExperiments,
  LangfuseInternalTraceEnvironment.LLMJudge,
  "langfuse-evaluation",
  "sdk-experiment",
] as const;

export const DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG = {
  hiddenEnvironments: DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS,
} as const;
