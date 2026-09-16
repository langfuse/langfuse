/** Builds the objects behind the Attributes and Model parameters tables. */

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
  // SDK spelling; both are search-bar aliases.
  if (sessionId) attributes.session_id = sessionId;
  if (userId) attributes.user_id = userId;
  return attributes;
}

/** Null when empty, so the table does not render. */
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
