import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";

interface CustomSSOUser extends Record<string, any> {
  email: string;
  id: string;
  name: string;
  verified: boolean;
}

export function CustomSSOProvider<P extends CustomSSOUser>(
  options: OAuthUserConfig<P>
): OAuthConfig<P> {
  return {
    id: "custom",
    name: "CustomSSOProvider",
    type: "oauth",
    wellKnown: `${options.issuer}/.well-known/openid-configuration`,
    authorization: { params: { scope: "openid email profile" } }, // overridden by options.authorization to be able to set custom scopes, deep merged with this default
    checks: ["pkce", "state"],
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: null,
      };
    },
    options,
  };
}
