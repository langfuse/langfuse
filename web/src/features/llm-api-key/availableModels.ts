import {
  type LLMAdapter,
  supportedModels,
  TEXT_ADAPTER_DECISION_MODEL_IDS,
} from "@langfuse/shared";

/**
 * Returns a connection's custom models plus, if enabled, its adapter's default
 * models. Decision-only defaults such as `gemini-decision-1` are included only
 * when requested, so text-model pickers never offer them.
 */
export function getConnectionAvailableModels(
  connection: {
    adapter: LLMAdapter;
    customModels: string[];
    withDefaultModels: boolean;
  },
  options?: { includeDecisionModels?: boolean },
): string[] {
  return Array.from(
    new Set([
      ...connection.customModels,
      ...(connection.withDefaultModels
        ? [
            ...supportedModels[connection.adapter],
            ...(options?.includeDecisionModels
              ? (TEXT_ADAPTER_DECISION_MODEL_IDS[connection.adapter] ?? [])
              : []),
          ]
        : []),
    ]),
  );
}
