import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";
import type { GithubProfile, GithubEmail } from "next-auth/providers/github";

export function GitHubEnterpriseProvider<P extends GithubProfile>(
  options: OAuthUserConfig<P> & {
    enterprise?: {
      baseUrl?: string;
    };
  },
): OAuthConfig<P> {
  const baseUrl = options?.enterprise?.baseUrl ?? "https://github.com";
  const apiBaseUrl = options?.enterprise?.baseUrl
    ? `${options?.enterprise?.baseUrl}/api/v3`
    : "https://api.github.com";

  return {
    id: "github-enterprise",
    name: "GitHub Enterprise",
    type: "oauth",
    authorization: {
      url: `${baseUrl}/login/oauth/authorize`,
      params: { scope: "read:user user:email" },
    },
    token: `${baseUrl}/login/oauth/access_token`,
    userinfo: {
      url: `${apiBaseUrl}/user`,
      async request({ client, tokens }) {
        const profile = await client.userinfo(tokens.access_token!);

        if (!profile.email) {
          // If the user does not have a public email, get another via the GitHub API
          // See https://docs.github.com/en/rest/users/emails#list-email-addresses-for-the-authenticated-user
          const res = await fetch(`${apiBaseUrl}/user/emails`, {
            headers: { Authorization: `token ${tokens.access_token}` },
          });

          if (res.ok) {
            const emails = (await res.json()) as GithubEmail[];
            profile.email = (emails.find((e) => e.primary) ?? emails[0]).email;
          }
        }

        return profile;
      },
    },
    profile(profile) {
      return {
        id: profile.id.toString(),
        name: profile.name ?? profile.login,
        email: profile.email,
        image: profile.avatar_url,
      };
    },
    style: {
      logo: "https://raw.githubusercontent.com/nextauthjs/next-auth/main/packages/next-auth/provider-logos/github.svg",
      logoDark:
        "https://raw.githubusercontent.com/nextauthjs/next-auth/main/packages/next-auth/provider-logos/github-dark.svg",
      bg: "#fff",
      bgDark: "#000",
      text: "#000",
      textDark: "#fff",
    },
    options,
  };
}
