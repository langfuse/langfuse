/** The fixed-key facts behind the Attributes table. */

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
