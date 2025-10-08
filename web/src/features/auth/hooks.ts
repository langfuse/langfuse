import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

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

interface LastUsedLogin {
  email: string;
  provider: string;
  timestamp: number;
}

const STORAGE_KEY = "langfuse_last_used_logins";
const MAX_ENTRIES = 3;
const EXPIRATION_DAYS = 30;

/**
 * Hook to manage last used login methods per email address.
 * Stores up to 3 entries with 30-day expiration.
 */
export const useLastUsedLogin = () => {
  const [logins, setLogins] = useState<LastUsedLogin[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as LastUsedLogin[];
        // Filter out expired entries
        const now = Date.now();
        const valid = parsed.filter(
          (login) =>
            now - login.timestamp < EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
        );
        setLogins(valid);

        // Update localStorage if we filtered anything
        if (valid.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
        }
      }
    } catch (error) {
      console.error("Failed to load last used logins:", error);
    }
  }, []);

  // Save a new login
  const saveLogin = useCallback((email: string, provider: string) => {
    if (typeof window === "undefined") return;

    try {
      const newLogin: LastUsedLogin = {
        email: email.toLowerCase(),
        provider,
        timestamp: Date.now(),
      };

      setLogins((prev) => {
        // Remove any existing entry for this email
        const filtered = prev.filter(
          (login) => login.email !== newLogin.email,
        );

        // Add new entry at the beginning
        const updated = [newLogin, ...filtered];

        // Keep only the most recent MAX_ENTRIES
        const trimmed = updated.slice(0, MAX_ENTRIES);

        // Save to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));

        return trimmed;
      });
    } catch (error) {
      console.error("Failed to save last used login:", error);
    }
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
    if (typeof window === "undefined") return;

    try {
      localStorage.removeItem(STORAGE_KEY);
      setLogins([]);
    } catch (error) {
      console.error("Failed to clear last used logins:", error);
    }
  }, []);

  return {
    saveLogin,
    getLastUsedProvider,
    clearLogins,
  };
};
