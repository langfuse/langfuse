import type { OAuthConfig } from "next-auth/providers/oauth";

interface SamlUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * NextAuth OAuth provider that delegates to Jackson's local OAuth endpoints.
 *
 * Jackson's embedded library exposes controller methods, not HTTP routes.
 * The corresponding Next.js API routes (under /api/auth/saml/) bridge HTTP
 * requests to Jackson controllers.
 */
export function SamlSSOProvider(options: {
  id: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  allowDangerousEmailAccountLinking?: boolean;
}): OAuthConfig<SamlUser> {
  return {
    id: options.id,
    name: "SAML SSO",
    type: "oauth",
    authorization: {
      url: `${options.issuer}/api/auth/saml/authorize`,
      params: {
        scope: "",
        response_type: "code",
        provider: "saml",
      },
    },
    token: {
      url: `${options.issuer}/api/auth/saml/token`,
    },
    userinfo: {
      url: `${options.issuer}/api/auth/saml/userinfo`,
    },
    profile(profile) {
      return {
        id: profile.id,
        email: profile.email,
        name: [profile.firstName, profile.lastName].filter(Boolean).join(" "),
        image: null,
      };
    },
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    allowDangerousEmailAccountLinking:
      options.allowDangerousEmailAccountLinking ?? false,
  };
}
