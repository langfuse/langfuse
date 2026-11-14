import {
  getSessionEnvironment,
  type MaybeSession,
} from "@/src/features/rbac/new/sessionAccessors";

/** getSessionV4WriteMode is the deployment's v4 write mode, or null when the session does not carry one. */
export function getSessionV4WriteMode(session: MaybeSession) {
  return getSessionEnvironment(session)?.v4WriteMode ?? null;
}
