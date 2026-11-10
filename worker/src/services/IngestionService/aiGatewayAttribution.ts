import { AI_GATEWAY_SERVICE_NAME } from "@langfuse/shared";
import {
  AI_GATEWAY_KEY_ID_METADATA_KEY,
  isAiGatewayIngestionApiKey,
} from "@langfuse/shared/src/server";

/**
 * Key and service a span is attributed to on the events table.
 *
 * An upload the AI gateway authenticated (ingestion key `gateway:<grant>`)
 * batches requests made with different gateway API keys. Each span names its
 * key in `langfuse.gateway.api_key.id`, which the gateway always overwrites, so
 * that key id becomes the span's ingestion API key. The service is the gateway,
 * versioned by its instrumentation scope: the gateway sends no `service.version`
 * because ingestion would use it as the generation's version. A gateway span
 * without a key id is rejected.
 */
export const resolveAiGatewayAttribution = (params: {
  ingestionApiKey: string | null | undefined;
  metadata: Record<string, unknown>;
  serviceName: string | null | undefined;
  serviceVersion: string | null | undefined;
  scopeVersion: string | null | undefined;
}): {
  ingestionApiKey: string;
  serviceName: string | null | undefined;
  serviceVersion: string | null | undefined;
} => {
  if (!isAiGatewayIngestionApiKey(params.ingestionApiKey)) {
    // Real gateway spans never get here, but an SDK sending straight to
    // Langfuse can claim the gateway's service name; such spans lose it.
    const spoofsGateway = params.serviceName === AI_GATEWAY_SERVICE_NAME;
    return {
      ingestionApiKey: params.ingestionApiKey ?? "",
      serviceName: spoofsGateway ? undefined : params.serviceName,
      serviceVersion: spoofsGateway ? undefined : params.serviceVersion,
    };
  }
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
