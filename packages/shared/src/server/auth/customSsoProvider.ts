import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";
import { env } from "../../env";

const CUSTOM_EMAIL_CLAIM = env.LANGFUSE_CUSTOM_SSO_EMAIL_CLAIM;
const CUSTOM_NAME_CLAIM = env.LANGFUSE_CUSTOM_SSO_NAME_CLAIM;
const CUSTOM_SUB_CLAIM = env.LANGFUSE_CUSTOM_SSO_SUB_CLAIM;

interface CustomSSOUser extends Record<string, any> {
  email: string;
  id: string;
  name: string;
  verified: boolean;
}

export function CustomSSOProvider<P extends CustomSSOUser>(
  options: OAuthUserConfig<P>,
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
        id: profile[CUSTOM_SUB_CLAIM],
        name: profile[CUSTOM_NAME_CLAIM],
        email: profile[CUSTOM_EMAIL_CLAIM],
        image: null,
      };
    },
    options,
  };
}
