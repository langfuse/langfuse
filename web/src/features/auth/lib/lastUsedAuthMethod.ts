/**
 * Utility functions for managing the last used authentication method in localStorage
 */

const LAST_USED_AUTH_METHOD_KEY = "langfuse_last_used_auth_method";

export type AuthMethod = 
  | "google"
  | "github" 
  | "github-enterprise"
  | "gitlab"
  | "azure-ad"
  | "okta"
  | "auth0"
  | "cognito"
  | "keycloak"
  | "workos"
  | "custom"
  | "credentials";

/**
 * Store the last used authentication method in localStorage
 */
export function storeLastUsedAuthMethod(method: AuthMethod): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(LAST_USED_AUTH_METHOD_KEY, method);
    }
  } catch (error) {
    // Silently fail if localStorage is not available
    console.warn("Failed to store last used auth method:", error);
  }
}

/**
 * Retrieve the last used authentication method from localStorage
 */
export function getLastUsedAuthMethod(): AuthMethod | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const method = localStorage.getItem(LAST_USED_AUTH_METHOD_KEY);
      return method as AuthMethod | null;
    }
  } catch (error) {
    // Silently fail if localStorage is not available
    console.warn("Failed to get last used auth method:", error);
  }
  return null;
}

/**
 * Clear the stored last used authentication method
 */
export function clearLastUsedAuthMethod(): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem(LAST_USED_AUTH_METHOD_KEY);
    }
  } catch (error) {
    // Silently fail if localStorage is not available
    console.warn("Failed to clear last used auth method:", error);
  }
}