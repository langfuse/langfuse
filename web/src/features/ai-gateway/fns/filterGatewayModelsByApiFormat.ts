import {
  type ApiFormat,
  gatewayApiFormatLabels,
} from "@/src/features/ai-gateway/fns/getGatewayModelApiFormats";

/**
 * The formats to filter by, in display order, and the models serving any
 * selected one. Formats are offered only when there are several and some
 * model lacks one, so a selection can narrow the list. A selection only
 * applies while formats are offered, since the filter is hidden otherwise,
 * and a selected format no model serves is ignored. Switching connections therefore never leaves a
 * filter hiding models without a visible way to clear it.
 */
export function filterGatewayModelsByApiFormat<
  Model extends { apiFormats: readonly ApiFormat[] },
>(models: Model[], selected: readonly ApiFormat[]) {
  const served = gatewayApiFormatLabels.filter((apiFormat) =>
    models.some((model) => model.apiFormats.includes(apiFormat)),
  );
  const canNarrow = served.some((apiFormat) =>
    models.some((model) => !model.apiFormats.includes(apiFormat)),
  );
  const available = served.length > 1 && canNarrow ? served : [];
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
