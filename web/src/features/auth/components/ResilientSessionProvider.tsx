import { type Session } from "next-auth";
import {
  SessionContext,
  useSession,
  type SessionContextValue,
} from "next-auth/react";
import {
  type PropsWithChildren,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** Re-checks of a session that went missing before its absence is believed. */
const MAX_RECHECKS = 2;
const RECHECK_DELAY_MS = 400;

/**
 * Asks next-auth's SessionProvider to re-fetch the session.
 *
 * Once its session is null the provider stops re-fetching on its own: the
 * window-focus and poll paths both bail out, and the exported `getSession()`
 * never writes back into provider state. Its cross-tab broadcast is the one
 * path that re-fetches a null session, so replay that message in this tab. If
 * next-auth ever renames the channel this becomes a no-op, which is where a
 * failed response leaves us anyway.
 */
function refetchSessionInProvider() {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: "nextauth.message", // next-auth's BroadcastChannel key
      newValue: JSON.stringify({
        event: "session",
        data: { trigger: "getSession" },
      }),
    }),
  );
}

/**
 * Keeps a transient session gap from reading as a sign-out.
 *
 * next-auth returns the same "no session" value when `/api/auth/session` fails
 * as when the server says the user is signed out, so one failed response used
 * to unmount everything that reads the session — the entire page subtree via
 * `AppLayout`, plus every RBAC-gated control — taking open dialogs and unsaved
 * edits with it. While a session that was present goes missing, keep serving it
 * and re-check; the absence only reaches the app once the re-checks agree, so a
 * real sign-out (here or in another tab) still tears the session down.
 */
export function ResilientSessionProvider({ children }: PropsWithChildren) {
  const session = useSession();
  const [recheckCount, setRecheckCount] = useState(0);
  const lastKnownSession = useRef<Session | null>(null);
  if (session.data) lastKnownSession.current = session.data;

  const knownSession = lastKnownSession.current;
  const isRechecking =
    session.status === "unauthenticated" &&
    knownSession !== null &&
    recheckCount < MAX_RECHECKS;

  useEffect(() => {
    if (session.status === "authenticated") {
      if (recheckCount > 0) setRecheckCount(0);
      return;
    }
    if (!isRechecking) return;

    refetchSessionInProvider();
    // Count the re-check only once it had time to land: recovering flips the
    // status, which re-runs this effect and cancels the timer.
    const timer = setTimeout(
      () => setRecheckCount((count) => count + 1),
      RECHECK_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [session.status, recheckCount, isRechecking]);

  const value = useMemo<SessionContextValue>(() => {
    if (!isRechecking || !knownSession) return session;
    return {
      data: knownSession,
      status: "authenticated",
      // next-auth's own update() bails while it has no session, so passing it
      // through here would drop the call. Callers use it to re-read the
      // session, which is what a re-check does anyway.
      update: async (data) => {
        if (data !== undefined) return session.update(data);
        refetchSessionInProvider();
        return null;
      },
    };
  }, [isRechecking, knownSession, session]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
