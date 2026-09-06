import type { LLMAdapter, ModelConfig } from "@langfuse/shared";

import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";

export type ProjectDefaultModelConfig = JudgeModel & {
  adapter: LLMAdapter;
  modelParams: ModelConfig;
};
