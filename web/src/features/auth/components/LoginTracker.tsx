import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { useLastUsedLogin } from "../hooks";

const PENDING_PROVIDER_KEY = "langfuse_pending_auth_provider";

/**
 * Tracks successful authentication and saves the provider/email to localStorage.
 * This component monitors NextAuth session changes and automatically records
 * which authentication method was used for each email address.
 *
 * Provider Detection:
 * - Reads from sessionStorage (set by sign-in/sign-up pages before OAuth redirect)
 * - Falls back to "credentials" if no provider is stored
 */
export function LoginTracker() {
  const session = useSession();
  const { saveLogin } = useLastUsedLogin();
  const lastTrackedAuth = useRef<string | null>(null);

  useEffect(() => {
    if (
      session.status === "authenticated" &&
      session.data?.user?.email &&
      session.data.user.id
    ) {
      const authKey = `${session.data.user.id}:${session.data.user.email}`;

      // Only track once per authentication
      if (lastTrackedAuth.current === authKey) {
        return;
      }

      lastTrackedAuth.current = authKey;

      // Try to get the provider from sessionStorage
      let provider: string | null = null;
      try {
        provider = sessionStorage.getItem(PENDING_PROVIDER_KEY);
        if (provider) {
          sessionStorage.removeItem(PENDING_PROVIDER_KEY);
        }
      } catch (error) {
        console.error("Failed to read pending provider:", error);
      }

      // If we have a provider, save the login
      if (provider && session.data.user.email) {
        saveLogin(session.data.user.email, provider);
      }
    } else if (session.status === "unauthenticated") {
      lastTrackedAuth.current = null;
    }
  }, [session, saveLogin]);

  return null;
}

/**
 * Helper function to store the provider before initiating OAuth flow.
 * Call this before signIn() to ensure the provider is tracked.
 */
export function setPendingAuthProvider(provider: string) {
  try {
    sessionStorage.setItem(PENDING_PROVIDER_KEY, provider);
  } catch (error) {
    console.error("Failed to set pending provider:", error);
  }
}
