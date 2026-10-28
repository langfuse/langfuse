import {
  AI_GATEWAY_KEY_ID_METADATA_KEY,
  AI_GATEWAY_SERVICE_NAME,
} from "@langfuse/shared/src/server";

type SpanAttribution = {
  ingestionApiKey: string;
  serviceName: string | null | undefined;
  serviceVersion: string | null | undefined;
};

/**
 * Key and service of a span from an upload the AI gateway authenticated
 * (ingestion key `gateway:<grant>`).
 *
 * One upload batches requests made with different gateway API keys. Each span
 * names its key in `langfuse.gateway.api_key.id`, which the gateway always
 * overwrites, so that key id becomes the span's ingestion API key. The service
 * is the gateway, versioned by its instrumentation scope: the gateway sends no
 * `service.version` because ingestion would use it as the generation's version.
 * A span without a key id is rejected.
 */
export const resolveAiGatewayAttribution = (params: {
  metadata: Record<string, unknown>;
  scopeVersion: string | null | undefined;
}): SpanAttribution => {
  const keyId = params.metadata[AI_GATEWAY_KEY_ID_METADATA_KEY];
  if (typeof keyId !== "string" || keyId.length === 0) {
    throw new Error(
      `AI gateway span is missing ${AI_GATEWAY_KEY_ID_METADATA_KEY} in its metadata`,
    );
  }
  return {
    ingestionApiKey: keyId,
    serviceName: AI_GATEWAY_SERVICE_NAME,
    serviceVersion: params.scopeVersion,
  };
};

/**
 * The gateway service name is reserved for gateway uploads. Any other sender,
 * including replays without an ingestion key, can set `service.name` freely,
 * so a claim to be the gateway clears the service name and version.
 */
export const withoutAiGatewayServiceClaim = (params: {
  serviceName: string | null | undefined;
  serviceVersion: string | null | undefined;
}): Pick<SpanAttribution, "serviceName" | "serviceVersion"> =>
  params.serviceName === AI_GATEWAY_SERVICE_NAME
    ? { serviceName: undefined, serviceVersion: undefined }
    : params;
