import { useSession } from "next-auth/react";

/** The events read path a data-fetching surface must use. */
export type ResolvedReadPath = "v3" | "v4";
/** "unknown" = the session has not resolved yet; no versioned fetch may fire. */
export type ReadPath = ResolvedReadPath | "unknown";

/**
 * The user's v3/v4 read path, derived from the session. v4 is the default
 * experience; v3 is the explicit legacy opt-out. While the session is still
 * loading the read path is "unknown": UI chrome may use the `isV4` /
 * `isV3Legacy` booleans (both false while unknown), but anything that fetches
 * by version must consume a resolved `readPath` — gate rendering on
 * `isResolved` and pass the narrowed value down as a prop.
 */
export function useReadPath(): {
  readPath: ReadPath;
  isV4: boolean;
  isV3Legacy: boolean;
  isResolved: boolean;
  canToggleV4: boolean;
} {
  const { data: session, status } = useSession();

  // A session re-check reports "loading" with the previous session still in
  // hand — that keeps the resolved path. Only a cold load is unknown.
  const readPath: ReadPath = session?.user
    ? session.user.v4BetaEnabled === true
      ? "v4"
      : "v3"
    : status === "loading"
      ? "unknown"
      : "v3";

  return {
    readPath,
    isV4: readPath === "v4",
    isV3Legacy: readPath === "v3",
    isResolved: readPath !== "unknown",
    canToggleV4: session?.user?.canToggleV4 === true,
  };
}
