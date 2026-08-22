import type { LLMAdapter } from "@langfuse/shared";

/** Provider and model pair identifying an LLM-as-a-judge model. */
export type JudgeModel = { provider: string; model: string };

type JudgeModelConnection = {
  provider: string;
  adapter: LLMAdapter;
  customModels: string[];
  withDefaultModels: boolean;
};

export function getJudgeModelProviderAdapters(
  connections: JudgeModelConnection[] | undefined,
) {
  return Object.fromEntries(
    connections?.map(({ provider, adapter }) => [provider, adapter]) ?? [],
  );
}
