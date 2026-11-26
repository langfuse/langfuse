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
 * Metadata key set to `"block"`, `"redact"`, or `"log"` on any gateway request
 * that matched at least one guardrail (omitted when none matched). Always set
 * by the gateway, never by callers.
 */
export const AI_GATEWAY_GUARDRAILS_OUTCOME_METADATA_KEY =
  "langfuse.gateway.guardrails.outcome";

/**
 * Metadata key prefix for individual matched guardrails:
 * `langfuse.gateway.guardrails.<id> = "block" | "log"` (omitted when a
 * guardrail did not match). Presence in `metadata_names` lets ClickHouse
 * filter on `events_core` via `idx_metadata_names` without reading
 * `metadata_values`.
 */
export const AI_GATEWAY_GUARDRAIL_METADATA_PREFIX =
  "langfuse.gateway.guardrails.";
