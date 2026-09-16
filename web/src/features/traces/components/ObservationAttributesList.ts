/**
 * Observation attributes: the fixed-key facts Langfuse knows (model,
 * environment, release, version, session, user), and the LLM call's own
 * parameters. Both are rendered with the same PrettyJsonView table as
 * metadata; this module only supplies the objects to render.
 */

import { type JsonNested } from "@langfuse/shared";

export function buildObservationAttributes({
  model,
  environment,
  release,
  version,
  sessionId,
  userId,
}: {
  model: string | null;
  environment: string | null;
  release: string | null | undefined;
  version: string | null;
  /** Trace-level; v4 events carry them on every observation. */
  sessionId?: string | null;
  userId?: string | null;
}): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  if (model) attributes.model = model;
  if (environment) attributes.environment = environment;
  if (release) attributes.release = release;
  if (version) attributes.version = version;
  // SDK spelling (`session_id`, `user_id`); both are search-bar aliases.
  if (sessionId) attributes.session_id = sessionId;
  if (userId) attributes.user_id = userId;
  return attributes;
}

/** The LLM call's own parameters (temperature, tools, reasoning …), as sent by
 * the SDK. Null when there are none, so the table does not render empty. */
export function buildModelParameters(
  modelParameters: JsonNested | null | undefined,
): Record<string, unknown> | null {
  if (
    !modelParameters ||
    typeof modelParameters !== "object" ||
    Array.isArray(modelParameters)
  )
    return null;
  const entries = Object.entries(modelParameters).filter(
    ([, value]) => value !== null && value !== undefined,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}
