import {
  getSessionUserCanToggleV4,
  getSessionUserV4BetaEnabled,
  hasSessionUser,
  type MaybeSession,
  type SessionStatus,
} from "@/src/features/rbac/new/sessionAccessors";

/** getSessionReadPath is the user's v3/v4 read path and toggle state, "unknown" only while a session without a user is still loading. */
export function getSessionReadPath(
  session: MaybeSession,
  status: SessionStatus,
): SessionReadPath {
  const readPath = resolveReadPath(session, status);

  return {
    readPath,
    isV4: readPath === "v4",
    isV3Legacy: readPath === "v3",
    isResolved: readPath !== "unknown",
    canToggleV4: getSessionUserCanToggleV4(session) === true,
  };
}

/** resolveReadPath keeps the resolved path through a session re-check, which reports "loading" with the previous session still in hand. */
function resolveReadPath(
  session: MaybeSession,
  status: SessionStatus,
): ReadPath {
  if (getSessionUserV4BetaEnabled(session) === true) {
    return "v4";
  }
  if (hasSessionUser(session)) {
    return "v3";
  }
  if (status === "loading") {
    return "unknown";
  }
  return "v3";
}

/** The events read path a data-fetching surface must use. */
export type ResolvedReadPath = "v3" | "v4";
/** "unknown" = the session has not resolved yet; no versioned fetch may fire. */
export type ReadPath = ResolvedReadPath | "unknown";

/** SessionReadPath is the read path together with the flags UI chrome derives from it. */
type SessionReadPath = {
  readPath: ReadPath;
  isV4: boolean;
  isV3Legacy: boolean;
  isResolved: boolean;
  canToggleV4: boolean;
};
