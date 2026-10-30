/**
 * OTel `service.name` of the AI gateway. On the events table, only spans the
 * gateway uploaded carry it as their `service_name`.
 */
export const AI_GATEWAY_SERVICE_NAME = "langfuse-ai-gateway";

/**
 * Metadata key holding the user a gateway API key is bound to. The gateway
 * always overwrites `langfuse.gateway.*` metadata, so callers cannot set it.
 */
export const AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY =
  "langfuse.gateway.api_key.owner.user_id";
