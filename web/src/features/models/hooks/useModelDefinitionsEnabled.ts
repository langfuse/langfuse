import { useSession } from "next-auth/react";

/**
 * Whether this instance resolves model definitions (LANGFUSE_MODEL_DEFINITIONS_ENABLED).
 *
 * Defaults to enabled while the session is loading and for sessions that predate
 * the field, so the Models surfaces never disappear and reappear on an instance
 * that has them switched on.
 */
export const useModelDefinitionsEnabled = (): boolean => {
  const session = useSession();
  return session.data?.environment.modelDefinitionsEnabled !== false;
};
