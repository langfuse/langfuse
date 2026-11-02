import type {
  OAuthConfig,
  OAuthUserConfig,
  UserinfoEndpointHandler,
} from "next-auth/providers/oauth";
import { env } from "../../env";

const CUSTOM_EMAIL_CLAIM = env.LANGFUSE_CUSTOM_SSO_EMAIL_CLAIM;
const CUSTOM_NAME_CLAIM = env.LANGFUSE_CUSTOM_SSO_NAME_CLAIM;
const CUSTOM_SUB_CLAIM = env.LANGFUSE_CUSTOM_SSO_SUB_CLAIM;
const CUSTOM_IMAGE_CLAIM = env.LANGFUSE_CUSTOM_SSO_IMAGE_CLAIM;

interface CustomSSOUser extends Record<string, any> {
  email: string;
  id: string;
  name: string;
  verified: boolean;
}

export type CustomSSOProviderOptions<P> = OAuthUserConfig<P> & {
  /**
   * Read the profile from the IdP's userinfo endpoint instead of from the ID
   * token claims, while keeping the OIDC callback (`client.callback()`).
   *
   * Needed for IdPs that do not put `email`/`name` into the ID token. Turning
   * `idToken` off is not an alternative there: `openid-client` refuses the
   * plain OAuth2 callback ("id_token detected in the response, you must use
   * client.callback() instead of client.oauthCallback()") as soon as the token
   * response carries an `id_token`, which any provider returns for an `openid`
   * scope.
   */
  fetchUserInfo?: boolean;
};

/**
 * NextAuth prefers `userinfo.request` over the ID token claims when building
 * the profile, so this only moves the profile source and leaves the token
 * exchange (and thus ID token signature validation) untouched.
 */
const userinfoEndpointProfile: UserinfoEndpointHandler = {
  async request({ client, tokens }) {
    // NextAuth types `tokens` as plain token parameters, the value it passes is
    // an openid-client TokenSet.
    const tokenSet = tokens as typeof tokens & {
      claims: () => Record<string, unknown>;
    };
    // Merge so claims that only the ID token carries (typically `sub`) survive;
    // userinfo wins on conflicts. `openid-client` verifies that the userinfo
    // `sub` matches the one in the ID token.
    const idTokenClaims = tokenSet.id_token ? tokenSet.claims() : {};
    const userinfo = await client.userinfo(
      tokenSet as unknown as Parameters<typeof client.userinfo>[0],
    );
    return { ...idTokenClaims, ...userinfo };
  },
};

export function CustomSSOProvider<P extends CustomSSOUser>(
  options: CustomSSOProviderOptions<P>,
): OAuthConfig<P> {
  // Keep `fetchUserInfo` out of the options that NextAuth merges into the
  // provider config, it is not part of the NextAuth provider contract.
  const { fetchUserInfo, ...oauthOptions } = options;

  return {
    id: "custom",
    name: "CustomSSOProvider",
    type: "oauth",
    wellKnown: `${options.issuer}/.well-known/openid-configuration`,
    authorization: { params: { scope: "openid email profile" } }, // overridden by options.authorization to be able to set custom scopes, deep merged with this default
    checks: ["pkce", "state"],
    ...(fetchUserInfo ? { userinfo: userinfoEndpointProfile } : {}),
    profile(profile) {
      const image = profile[CUSTOM_IMAGE_CLAIM];
      return {
        id: profile[CUSTOM_SUB_CLAIM],
        name: profile[CUSTOM_NAME_CLAIM],
        email: profile[CUSTOM_EMAIL_CLAIM],
        image: typeof image === "string" && image.length > 0 ? image : null,
      };
    },
    options: oauthOptions,
  };
}
