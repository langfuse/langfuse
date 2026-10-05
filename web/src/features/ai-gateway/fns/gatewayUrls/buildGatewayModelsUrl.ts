import { encodeFiltersGeneric } from "@langfuse/shared";

export function buildGatewayModelsUrl(
  organizationId: string,
  connectionId: string,
) {
  const params = new URLSearchParams({
    filter: encodeFiltersGeneric([
      {
        column: "connection",
        type: "arrayOptions",
        operator: "any of",
        value: [connectionId],
      },
    ]),
  });

  return `/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway-models?${params.toString()}`;
}
