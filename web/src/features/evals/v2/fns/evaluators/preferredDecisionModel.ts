import {
  getConnectionDefaultModels,
  isAllowedDecisionModel,
  LLMAdapter,
  OPENAI_DECISION_MODEL_IDS,
  supportsDecisionModels,
} from "@langfuse/shared";

import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";

type DecisionModelConnection = {
  provider: string;
  adapter: string;
  baseURL?: string | null;
  customModels: readonly string[];
  withDefaultModels: boolean;
};

function defaultModelsFor(
  connection: DecisionModelConnection,
): readonly string[] {
  if (
    connection.adapter === LLMAdapter.OpenAI ||
    connection.adapter === LLMAdapter.TypeSafe
  ) {
    return getConnectionDefaultModels({
      adapter: connection.adapter,
      baseURL: connection.baseURL,
    });
  }
  return [];
}

/** Decision models each connection can run, keyed by provider. */
export function decisionModelsByProvider(
  connections: readonly DecisionModelConnection[],
): Map<string, string[]> {
  const modelsByProvider = new Map<string, string[]>();
  for (const connection of connections) {
    if (!supportsDecisionModels(connection.adapter)) continue;
    const models = Array.from(
      new Set([
        ...connection.customModels,
        ...(connection.withDefaultModels ? defaultModelsFor(connection) : []),
      ]),
    ).filter((model) => isAllowedDecisionModel(connection.adapter, model));
    if (models.length > 0) modelsByProvider.set(connection.provider, models);
  }
  return modelsByProvider;
}

/**
 * OpenAI is the default decision provider. The first allowlisted model a
 * connection actually offers wins. TypeSafe is never chosen for the user.
 */
export function preferredDecisionModel(
  connections: readonly DecisionModelConnection[],
): JudgeModel | null {
  const modelsByProvider = decisionModelsByProvider(connections);
  for (const model of OPENAI_DECISION_MODEL_IDS) {
    for (const [provider, models] of modelsByProvider) {
      if (models.includes(model)) return { provider, model };
    }
  }
  return null;
}

/** Use the saved choice. Fill an empty decision-model choice from the connection list. */
export function applyFallbackDecisionModel<
  T extends { type: string; selectedModel: JudgeModel | null },
>(state: T, fallback: JudgeModel | null): T {
  if (
    state.type !== "DECISION_MODEL" ||
    state.selectedModel != null ||
    fallback == null
  ) {
    return state;
  }
  return { ...state, selectedModel: fallback };
}
