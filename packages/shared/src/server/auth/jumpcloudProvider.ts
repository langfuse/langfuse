import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";

interface JumpCloudProfile extends Record<string, any> {
  sub: string;
  email: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
}

export function JumpCloudProvider<P extends JumpCloudProfile>(
  options: OAuthUserConfig<P>,
): OAuthConfig<P> {
  return {
    id: "jumpcloud",
    name: "JumpCloud",
    type: "oauth",
    wellKnown: `${options.issuer?.replace(/\/$/, "")}/.well-known/openid-configuration`,
    authorization: {
      params: { scope: "openid profile email" }, // Default scope, can be overridden by options.authorization
    },
    checks: ["pkce", "state"],
    profile(profile) {
      // JumpCloud provides given_name and family_name separately
      // Combine them if name is not directly provided
      const name =
        profile.name ??
        `${profile.given_name ?? ""} ${profile.family_name ?? ""}`.trim();

      return {
        id: profile.sub,
        name: name || profile.email,
        email: profile.email,
        image: null,
      };
    },
    ...options,
  };
}
