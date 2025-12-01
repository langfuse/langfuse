/**
 * Enhanced session hook with retry logic
 *
 * TODO: Remove retry workaround once /api/auth/session reliability is fixed.
 * This hook exists to mitigate exceptions on the /api/auth/session endpoint which
 * cause the session to be unauthenticated even though the user is signed in.
 */

import { useSession, getSession } from "next-auth/react";
import { useState, useEffect } from "react";

const MAX_RETRIES = 2;

/**
 * Patched version of useSession that retries fetching the session if the user
 * is unauthenticated. This is useful to mitigate exceptions on the
 * /api/auth/session endpoint.
 *
 * @returns Session object with retry logic applied
 */
export function useAuthSession() {
  const [retryCount, setRetryCount] = useState(0);
  const session = useSession();

  useEffect(() => {
    if (session.status === "unauthenticated" && retryCount < MAX_RETRIES) {
      const fetchSession = async () => {
        try {
          await getSession({ broadcast: true });
        } catch (error) {
          console.error("Error fetching session:", error);
          // Don't throw - The /api/auth/session endpoint occasionally fails
          // with transient errors. By not throwing, we allow the retry logic
          // to attempt recovery on the next iteration.
        }
        setRetryCount((prevCount) => prevCount + 1);
      };
      void fetchSession();
    }

    // Reset retry count on successful authentication
    if (session.status === "authenticated" && retryCount > 0) {
      setRetryCount(0);
    }
  }, [session.status, retryCount]);

  // Return loading state if we're still retrying
  return session.status !== "unauthenticated" || retryCount >= MAX_RETRIES
    ? session
    : { ...session, status: "loading" as const };
}
