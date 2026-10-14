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

/** Delay before re-checking a session that went missing, doubling up to the cap. */
const RECHECK_DELAY_MS = 400;
const MAX_RECHECK_DELAY_MS = 10_000;

const recheckDelay = (attempt: number) =>
  Math.min(RECHECK_DELAY_MS * 2 ** attempt, MAX_RECHECK_DELAY_MS);

/**
 * Asks next-auth's SessionProvider to re-fetch the session.
 *
 * Once its session is null the provider stops re-fetching on its own: the
 * window-focus and poll paths both bail out, and the exported `getSession()`
 * never writes back into provider state. Its cross-tab broadcast is the one
 * path that re-fetches a null session, so replay that message in this tab. If
 * next-auth ever renames the channel this becomes a no-op and we keep serving
 * the last known session, which is better than the sign-out it replaces.
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
 * Asks the session endpoint the one question next-auth's client cannot answer:
 * is the user signed out, or did the request simply not get through? Anything
 * short of a readable "no session" answer counts as unreachable.
 */
async function probeSession(
  basePath: string,
): Promise<"signed-in" | "signed-out" | "unreachable"> {
  try {
    const response = await fetch(`${basePath}/session`);
    if (!response.ok) return "unreachable";
    const body = (await response.json()) as Record<string, unknown> | null;
    return body && Object.keys(body).length > 0 ? "signed-in" : "signed-out";
  } catch {
    return "unreachable";
  }
}

/**
 * Keeps a session gap from reading as a sign-out.
 *
 * next-auth returns the same "no session" value when `/api/auth/session` fails
 * as when the server says the user is signed out, so one failed response used
 * to unmount everything that reads the session — the entire page subtree via
 * `AppLayout`, plus every session-gated control — taking open dialogs and
 * unsaved edits with it.
 *
 * The rule here: only the server ends a session. While a session that was
 * present goes missing, keep serving it, nudge next-auth to re-fetch, and ask
 * the endpoint directly what happened. A "no session" answer is passed straight
 * through, so a real sign-out (here or in another tab) still tears the session
 * down; an unreachable endpoint is not an answer, so the page stays as it is
 * for as long as it takes.
 */
export function ResilientSessionProvider({
  basePath,
  children,
}: PropsWithChildren<{ basePath: string }>) {
  const session = useSession();
  const [attempt, setAttempt] = useState(0);
  const [serverSaysSignedOut, setServerSaysSignedOut] = useState(false);
  const lastKnownSession = useRef<Session | null>(null);
  if (session.data) lastKnownSession.current = session.data;

  const knownSession = lastKnownSession.current;
  const isRechecking =
    session.status === "unauthenticated" &&
    knownSession !== null &&
    !serverSaysSignedOut;

  useEffect(() => {
    if (session.status === "authenticated") {
      if (attempt > 0) setAttempt(0);
      if (serverSaysSignedOut) setServerSaysSignedOut(false);
      return;
    }
    if (!isRechecking) return;

    let cancelled = false;
    // Recovering flips the status, which re-runs this effect and cancels the
    // timer before it can ask why the session went missing.
    refetchSessionInProvider();
    const timer = setTimeout(async () => {
      const verdict = await probeSession(basePath);
      if (cancelled) return;
      if (verdict === "signed-out") setServerSaysSignedOut(true);
      else setAttempt((count) => count + 1);
    }, recheckDelay(attempt));

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session.status, attempt, isRechecking, serverSaysSignedOut, basePath]);

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
