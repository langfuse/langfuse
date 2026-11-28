import { LLMAdapter, TEXT_ADAPTER_DECISION_MODEL_IDS } from "@langfuse/shared";

import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import { GATEWAY_DECISION_MODEL_PROVIDERS } from "@/src/features/ai-gateway/types/gatewayGuardrail";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import type { RouterOutputs } from "@/src/utils/api";

export type GatewayDecisionModelConnection = {
  id: string;
  name: string;
  provider: GatewayProvider;
  models: string[];
  isCatalogUnknown: boolean;
};

const OPENAI_KNOWN_DECISION_MODELS = new Set(
  TEXT_ADAPTER_DECISION_MODEL_IDS[LLMAdapter.OpenAI] ?? [],
);

/**
 * Enabled gateway connections that support `/v1/decisions`, together with their
 * enabled decision-capable models.
 */
export function listGatewayDecisionModelConnections(
  connections: RouterOutputs["aiGateway"]["listModelConnections"],
  results: RouterOutputs["aiGateway"]["refreshModels"],
): GatewayDecisionModelConnection[] {
  const eligible = connections.filter((connection) =>
    (GATEWAY_DECISION_MODEL_PROVIDERS as readonly string[]).includes(
      connection.provider,
    ),
  );

  return eligible.map((connection) => {
    const result = results.find(
      ({ connectionId }) => connectionId === connection.id,
    );
    const allowedModels = toGatewayAllowedModelsSet(connection.allowedModels);
    const isCatalogUnknown =
      !result?.success ||
      Boolean(result.modelListingDenied) ||
      (Boolean(result.catalogUnavailable) && allowedModels === null);

    if (!result?.success || isCatalogUnknown) {
      return {
        id: connection.id,
        name: connection.name,
        provider: connection.provider,
        models: [],
        isCatalogUnknown: true,
      };
    }

    const models = result.models.filter((model) => {
      if (!isGatewayModelAllowed(allowedModels, model)) return false;
      const reportedFormats = result.modelApiFormats?.[model];
      if (reportedFormats) {
        return reportedFormats.includes("openai.decisions");
      }
      return true;
    });

    if (connection.provider === "OPENAI") {
      models.sort(
        (left, right) =>
          Number(OPENAI_KNOWN_DECISION_MODELS.has(right)) -
          Number(OPENAI_KNOWN_DECISION_MODELS.has(left)),
      );
    }

    return {
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      models,
      isCatalogUnknown: false,
    };
  });
}
