/**
 * Formats authentication provider IDs into user-friendly display names.
 * Handles both standard OAuth providers and multi-tenant SSO configurations.
 *
 * Security: Multi-tenant SSO providers use format "domain.provider" (e.g., "acme.com.okta").
 * We sanitize these to hide customer domain information, showing only the SSO type.
 */
export function formatAuthProviderName(provider: string): string {
  // Multi-tenant SSO format: "domain.provider"
  // SECURITY: Strip domain to prevent leaking customer information
  if (provider.includes(".")) {
    const providerType = provider.split(".").pop() ?? "";

    switch (providerType) {
      case "azure-ad":
        return "Enterprise SSO (Azure AD)";
      case "okta":
        return "Enterprise SSO (Okta)";
      case "auth0":
        return "Enterprise SSO (Auth0)";
      case "keycloak":
        return "Enterprise SSO (Keycloak)";
      case "cognito":
        return "Enterprise SSO (AWS Cognito)";
      case "authentik":
        return "Enterprise SSO (Authentik)";
      case "onelogin":
        return "Enterprise SSO (OneLogin)";
      case "jumpcloud":
        return "Enterprise SSO (JumpCloud)";
      case "workos":
        return "Enterprise SSO (WorkOS)";
      case "wordpress":
        return "Enterprise SSO (WordPress)";
      case "github":
        return "Enterprise SSO (GitHub)";
      case "github-enterprise":
        return "Enterprise SSO (GitHub Enterprise)";
      case "gitlab":
        return "Enterprise SSO (GitLab)";
      case "google":
        return "Enterprise SSO (Google)";
      case "custom":
        return "Enterprise SSO (Custom)";
      default:
        return "Enterprise SSO";
    }
  }

  // Standard provider mapping (global instance config, not customer-specific)
  const providerMap: Record<string, string> = {
    credentials: "Email/Password",
    google: "Google",
    github: "GitHub",
    "github-enterprise": "GitHub Enterprise",
    gitlab: "GitLab",
    "azure-ad": "Azure AD",
    okta: "Okta",
    auth0: "Auth0",
    "clickhouse-cloud": "ClickHouse Cloud",
    cognito: "AWS Cognito",
    keycloak: "Keycloak",
    authentik: "Authentik",
    onelogin: "OneLogin",
    jumpcloud: "JumpCloud",
    workos: "WorkOS",
    wordpress: "WordPress",
    custom: "Custom SSO",
  };

  return providerMap[provider] ?? "SSO";
}
