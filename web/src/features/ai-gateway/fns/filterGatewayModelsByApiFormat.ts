import {
  type ApiFormat,
  gatewayApiFormatLabels,
} from "@/src/features/ai-gateway/fns/getGatewayModelApiFormats";

/**
 * The formats the models serve, in display order, and the models serving any
 * selected one. A selected format no model serves is ignored, so switching
 * providers never leaves a filter that hides every model.
 */
export function filterGatewayModelsByApiFormat<
  Model extends { apiFormats: readonly ApiFormat[] },
>(models: Model[], selected: readonly ApiFormat[]) {
  const available = gatewayApiFormatLabels.filter((apiFormat) =>
    models.some((model) => model.apiFormats.includes(apiFormat)),
  );
  const active = selected.filter((apiFormat) => available.includes(apiFormat));
  return {
    available,
    active,
    models:
      active.length === 0
        ? models
        : models.filter((model) =>
            model.apiFormats.some((apiFormat) => active.includes(apiFormat)),
          ),
  };
}
