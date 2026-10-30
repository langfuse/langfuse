import type { LLMAdapter } from "@langfuse/shared";

/** Provider and model pair identifying an LLM-as-a-judge model. */
export type JudgeModel = { provider: string; model: string };

export function isJudgeModelAvailable(
  model: JudgeModel | null,
  providerGroups: Array<[string, string[]]>,
) {
  return Boolean(
    model &&
    providerGroups.some(
      ([provider, models]) =>
        provider === model.provider && models.includes(model.model),
    ),
  );
}

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
