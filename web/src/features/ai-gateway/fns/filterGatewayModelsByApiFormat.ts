import {
  type ApiFormat,
  gatewayApiFormatLabels,
} from "@/src/features/ai-gateway/fns/getGatewayModelApiFormats";

/**
 * The formats the models serve, in display order, and the models serving any
 * selected one. A selection only applies while the models span several
 * formats, since the filter is hidden otherwise, and a selected format no
 * model serves is ignored. Switching connections therefore never leaves a
 * filter hiding models without a visible way to clear it.
 */
export function filterGatewayModelsByApiFormat<
  Model extends { apiFormats: readonly ApiFormat[] },
>(models: Model[], selected: readonly ApiFormat[]) {
  const available = gatewayApiFormatLabels.filter((apiFormat) =>
    models.some((model) => model.apiFormats.includes(apiFormat)),
  );
  const active =
    available.length > 1
      ? selected.filter((apiFormat) => available.includes(apiFormat))
      : [];
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
