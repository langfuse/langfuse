import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTrackLoginAttempt } from "@/src/features/auth/hooks/useLastUsedLogin";

/**
 * Component that tracks successful logins and saves them to localStorage
 * Should be placed in the app root to monitor session changes
 */
export function LoginTracker() {
  const { data: session, status } = useSession();
  const { completePendingLogin } = useTrackLoginAttempt();

  useEffect(() => {
    // When user becomes authenticated, complete any pending login tracking
    if (status === "authenticated" && session?.user?.email) {
      const completedLogin = completePendingLogin();
      
      if (completedLogin) {
        console.log("Completed login tracking for:", completedLogin);
      }
    }
  }, [status, session, completePendingLogin]);

  return null; // This component doesn't render anything
}