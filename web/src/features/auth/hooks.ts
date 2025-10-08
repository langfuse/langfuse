import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import {
  loadLastUsedLogins,
  saveLastUsedLogin,
  clearLastUsedLogins,
  type LastUsedLogin,
} from "./storage";

/**
 * Hook to check if the user is authenticated and a member of the project.
 */
export const useIsAuthenticatedAndProjectMember = (
  projectId: string,
): boolean => {
  const session = useSession();

  if (projectId === "") return false;

  return (
    session.status === "authenticated" &&
    !!session.data?.user?.organizations
      .flatMap((org) => org.projects)
      .find(({ id }) => id === projectId)
  );
};

// Re-export storage functions for backward compatibility
export {
  setPendingAuthProvider as setPendingProviderForRedirect,
  getAndClearPendingAuthProvider as readAndClearPendingProvider,
} from "./storage";

/**
 * Hook to manage last used login methods per email address.
 * Stores up to 3 entries with 30-day expiration.
 */
export const useLastUsedLogin = () => {
  const [logins, setLogins] = useState<LastUsedLogin[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    const loaded = loadLastUsedLogins();
    setLogins(loaded);
  }, []);

  // Save a new login
  const saveLogin = useCallback((email: string, provider: string) => {
    saveLastUsedLogin(email, provider);
    // Reload to update state
    const updated = loadLastUsedLogins();
    setLogins(updated);
  }, []);

  // Get the last used provider for a specific email
  const getLastUsedProvider = useCallback(
    (email: string): string | null => {
      const normalizedEmail = email.toLowerCase();
      const login = logins.find((l) => l.email === normalizedEmail);
      return login?.provider ?? null;
    },
    [logins],
  );

  // Clear all stored logins
  const clearLogins = useCallback(() => {
    clearLastUsedLogins();
    setLogins([]);
  }, []);

  return {
    saveLogin,
    getLastUsedProvider,
    clearLogins,
  };
};
