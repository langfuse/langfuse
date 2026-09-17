import type { LLMAdapter, ModelConfig } from "@langfuse/shared";

import type { JudgeModel } from "../judgeModel";

export type ProjectDefaultModelConfig = JudgeModel & {
  adapter: LLMAdapter;
  modelParams: ModelConfig;
};
