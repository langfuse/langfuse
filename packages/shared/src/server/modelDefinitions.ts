import { env } from "../env";
import { ForbiddenError } from "../errors";

/**
 * Whether this instance resolves model definitions at all.
 *
 * Gates three things that all hang off the same entity: the managed price list
 * seeded at worker start, the model match that drives cost calculation, and the
 * tokenizer that estimates usage when the client supplies none. Usage and costs
 * that arrive on the event are unaffected — they are the caller's data, not
 * something Langfuse infers.
 */
export const isModelDefinitionsEnabled = (): boolean =>
  env.LANGFUSE_MODEL_DEFINITIONS_ENABLED === "true";

const MODEL_DEFINITIONS_DISABLED_MESSAGE =
  "Model definitions are disabled on this Langfuse instance (LANGFUSE_MODEL_DEFINITIONS_ENABLED=false). Costs and usage must be supplied on the ingested event.";

/**
 * Guards the read and write paths that only make sense while model definitions
 * are resolved: the tRPC router, the public API and the MCP tools built on it.
 *
 * 403 rather than 404, which the same endpoints already use for an unknown
 * model id, and rather than a 5xx, which both error handlers treat as an
 * unexpected fault — they replace the message and open a trace span. A
 * deliberately disabled capability is neither.
 */
export const assertModelDefinitionsEnabled = (): void => {
  if (!isModelDefinitionsEnabled()) {
    throw new ForbiddenError(MODEL_DEFINITIONS_DISABLED_MESSAGE);
  }
};
