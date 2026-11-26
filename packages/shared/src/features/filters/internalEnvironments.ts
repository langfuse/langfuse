import { LangfuseInternalTraceEnvironment } from "../../server/llm/types";
import {
  PUBLIC_INTERNAL_EVAL_ENVIRONMENTS,
  PUBLIC_TOPICS_ENVIRONMENT,
} from "../../server/llm/isInternalEvalEnvironment";

export { PUBLIC_INTERNAL_EVAL_ENVIRONMENTS };

export const DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS = [
  LangfuseInternalTraceEnvironment.PromptExperiments,
  LangfuseInternalTraceEnvironment.LLMJudge,
  LangfuseInternalTraceEnvironment.CodeEval,
  LangfuseInternalTraceEnvironment.NaturalLanguageFilter,
  LangfuseInternalTraceEnvironment.Topics,
  PUBLIC_TOPICS_ENVIRONMENT,
  "langfuse-evaluation",
  "sdk-experiment",
] as const;

export const DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG = {
  hiddenEnvironments: DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS,
} as const;
