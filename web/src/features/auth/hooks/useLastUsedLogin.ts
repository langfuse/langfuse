import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import {
  saveLastUsedLogin,
  getLastUsedLogins,
  getLastUsedLoginForEmail,
  getProviderDisplayName,
  getProviderIcon,
  type LastUsedLogin,
} from "@/src/features/auth/lib/lastUsedLogin";

/**
 * Hook to track and manage last used login methods
 */
export function useLastUsedLogin() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const previousStatusRef = useRef<string>(status);
  const [lastUsedLogins, setLastUsedLogins] = useState<LastUsedLogin[]>([]);

  // Track successful sign-ins
  useEffect(() => {
    // Only track when transitioning from unauthenticated/loading to authenticated
    if (
      status === "authenticated" &&
      session?.user?.email &&
      previousStatusRef.current !== "authenticated"
    ) {
      // Try to determine which provider was used
      const provider = determineProviderFromUrl() || "unknown";
      
      if (provider !== "unknown") {
        const loginData = {
          provider,
          email: session.user.email,
          providerName: getProviderDisplayName(provider),
          providerIcon: getProviderIcon(provider),
        };

        saveLastUsedLogin(loginData);
        
        // Update local state
        setLastUsedLogins(getLastUsedLogins());
      }
    }

    previousStatusRef.current = status;
  }, [status, session]);

  // Load last used logins on mount
  useEffect(() => {
    setLastUsedLogins(getLastUsedLogins());
  }, []);

  // Helper function to determine provider from URL or other indicators
  function determineProviderFromUrl(): string | null {
    // Check if we came from a NextAuth callback URL
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const callbackUrl = urlParams.get("callbackUrl");
      
      // Check if there's a provider in the URL path or referrer
      const currentPath = window.location.pathname;
      const referrer = document.referrer;
      
      // Look for provider indicators in the URL or referrer
      const providers = [
        "google", "github", "gitlab", "azure-ad", "okta", 
        "auth0", "cognito", "keycloak", "workos", "custom", "credentials"
      ];
      
      for (const provider of providers) {
        if (
          currentPath.includes(provider) || 
          referrer.includes(provider) ||
          callbackUrl?.includes(provider)
        ) {
          return provider;
        }
      }

      // Check for multi-tenant SSO patterns (domain.provider)
      const ssoMatch = referrer.match(/[\w-]+\.(google|github|gitlab|azure-ad|okta|auth0|cognito|keycloak|custom)/);
      if (ssoMatch) {
        return ssoMatch[0]; // Return the full domain.provider string
      }

      // Check for GitHub Enterprise pattern
      if (referrer.includes("github-enterprise")) {
        return "github-enterprise";
      }
    }

    return null;
  }

  return {
    lastUsedLogins,
    getLastUsedLoginForEmail,
    refreshLastUsedLogins: () => setLastUsedLogins(getLastUsedLogins()),
  };
}

/**
 * Hook specifically for tracking login attempts and storing provider info
 * This should be called when a user initiates a login with a specific provider
 */
export function useTrackLoginAttempt() {
  const pendingLoginRef = useRef<{
    provider: string;
    email: string;
  } | null>(null);

  const trackLoginAttempt = (provider: string, email: string) => {
    pendingLoginRef.current = { provider, email };
    
    // Store in sessionStorage temporarily so it persists through the auth flow
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "langfuse_pending_login",
        JSON.stringify({
          provider,
          email,
          timestamp: Date.now(),
        })
      );
    }
  };

  const completePendingLogin = () => {
    if (typeof window !== "undefined") {
      const pending = sessionStorage.getItem("langfuse_pending_login");
      if (pending) {
        try {
          const { provider, email } = JSON.parse(pending);
          const loginData = {
            provider,
            email,
            providerName: getProviderDisplayName(provider),
            providerIcon: getProviderIcon(provider),
          };
          
          saveLastUsedLogin(loginData);
          sessionStorage.removeItem("langfuse_pending_login");
          return loginData;
        } catch (error) {
          console.error("Error completing pending login:", error);
        }
      }
    }
    return null;
  };

  return {
    trackLoginAttempt,
    completePendingLogin,
  };
}