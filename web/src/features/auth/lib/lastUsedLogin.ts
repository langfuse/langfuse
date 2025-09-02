import { z } from "zod";

// Schema for last used login method
const LastUsedLoginSchema = z.object({
  provider: z.string(),
  email: z.string().email(),
  timestamp: z.number(),
  // For display purposes
  providerName: z.string(),
  providerIcon: z.string().optional(),
});

export type LastUsedLogin = z.infer<typeof LastUsedLoginSchema>;

const STORAGE_KEY = "langfuse_last_used_login";
const MAX_ENTRIES = 3; // Keep track of last 3 successful logins
const MAX_AGE_DAYS = 30; // Keep entries for 30 days

/**
 * Get all last used login methods from localStorage
 */
export function getLastUsedLogins(): LastUsedLogin[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    // Filter out expired entries and validate schema
    const now = Date.now();
    const maxAge = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    return parsed
      .filter((entry) => {
        const result = LastUsedLoginSchema.safeParse(entry);
        return result.success && now - entry.timestamp < maxAge;
      })
      .sort((a, b) => b.timestamp - a.timestamp) // Most recent first
      .slice(0, MAX_ENTRIES);
  } catch (error) {
    console.error("Error reading last used logins from localStorage:", error);
    return [];
  }
}

/**
 * Get the most recent login method for a specific email
 */
export function getLastUsedLoginForEmail(email: string): LastUsedLogin | null {
  const logins = getLastUsedLogins();
  return logins.find((login) => login.email.toLowerCase() === email.toLowerCase()) || null;
}

/**
 * Save a successful login method to localStorage
 */
export function saveLastUsedLogin(login: Omit<LastUsedLogin, "timestamp">): void {
  if (typeof window === "undefined") return;

  try {
    const existingLogins = getLastUsedLogins();
    
    // Remove any existing entry for this email/provider combination
    const filteredLogins = existingLogins.filter(
      (existing) => 
        !(existing.email.toLowerCase() === login.email.toLowerCase() && 
          existing.provider === login.provider)
    );

    // Add the new login at the beginning
    const newLogin: LastUsedLogin = {
      ...login,
      timestamp: Date.now(),
    };

    const updatedLogins = [newLogin, ...filteredLogins].slice(0, MAX_ENTRIES);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLogins));
  } catch (error) {
    console.error("Error saving last used login to localStorage:", error);
  }
}

/**
 * Clear all last used logins from localStorage
 */
export function clearLastUsedLogins(): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing last used logins from localStorage:", error);
  }
}

/**
 * Get a human-readable provider name
 */
export function getProviderDisplayName(provider: string): string {
  const providerMap: Record<string, string> = {
    google: "Google",
    github: "GitHub",
    "github-enterprise": "GitHub Enterprise",
    gitlab: "GitLab",
    "azure-ad": "Azure AD",
    okta: "Okta",
    auth0: "Auth0",
    cognito: "Cognito",
    keycloak: "Keycloak",
    workos: "WorkOS",
    credentials: "Email/Password",
    custom: "Custom SSO",
  };

  // Handle multi-tenant SSO providers (format: domain.provider)
  if (provider.includes(".")) {
    const [, baseProvider] = provider.split(".");
    return providerMap[baseProvider] || "SSO";
  }

  return providerMap[provider] || provider;
}

/**
 * Get the icon component name for a provider
 */
export function getProviderIcon(provider: string): string {
  const iconMap: Record<string, string> = {
    google: "SiGoogle",
    github: "SiGithub",
    "github-enterprise": "SiGithub",
    gitlab: "SiGitlab",
    "azure-ad": "TbBrandAzure",
    okta: "SiOkta",
    auth0: "SiAuth0",
    cognito: "SiAmazoncognito",
    keycloak: "SiKeycloak",
    workos: "Code",
    credentials: "AtSign", // Using AtSign for email/credentials
    custom: "TbBrandOauth",
  };

  // Handle multi-tenant SSO providers
  if (provider.includes(".")) {
    const [, baseProvider] = provider.split(".");
    return iconMap[baseProvider] || "TbBrandOauth";
  }

  return iconMap[provider] || "TbBrandOauth";
}