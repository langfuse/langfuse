/**
 * OTel `service.name` of the AI gateway. On the events table, only spans the
 * gateway uploaded carry it as their `service_name`.
 */
export const AI_GATEWAY_SERVICE_NAME = "langfuse-ai-gateway";

/**
 * Metadata key holding the gateway API key that produced the observation. The
 * gateway always overwrites `langfuse.gateway.*` metadata, so callers cannot
 * set it.
 */
export const AI_GATEWAY_KEY_ID_METADATA_KEY = "langfuse.gateway.api_key.id";

/**
 * Metadata key holding the user a gateway API key is bound to. The gateway
 * always overwrites `langfuse.gateway.*` metadata, so callers cannot set it.
 */
export const AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY =
  "langfuse.gateway.api_key.owner.user_id";

/**
 * Trace-list filters used by the AI Gateway "Show traces" action. These keys
 * are written on the generation observation; they must also be merged onto the
 * trace so a traces.metadata filter can find generations that ran under a
 * caller-propagated parent span.
 */
export const AI_GATEWAY_TRACE_ATTRIBUTION_METADATA_KEYS = [
  AI_GATEWAY_KEY_ID_METADATA_KEY,
  AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
] as const;

export function pickGatewayTraceAttributionMetadata(
  metadata: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  if (!metadata) {
    return picked;
  }
  for (const key of AI_GATEWAY_TRACE_ATTRIBUTION_METADATA_KEYS) {
    const value = metadata[key];
    if (value !== undefined && value !== null && value !== "") {
      picked[key] = value;
    }
  }
  return picked;
}
