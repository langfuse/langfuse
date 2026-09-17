import { type GetServerSideProps } from "next";
import { env } from "@/src/env.mjs";
import { isAnySsoConfigured } from "@/src/ee/features/multi-tenant-sso/utils";
import { isEmailVerificationRequired } from "@/src/features/auth-credentials/lib/credentialsUtils";
import { type PageProps } from "@/src/features/auth/SignInPage";

// Also used in src/pages/auth/sign-up.tsx via the pages/auth/sign-in shim.
export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const sso: boolean = await isAnySsoConfigured();
  return {
    props: {
      authProviders: {
        google:
          env.AUTH_GOOGLE_CLIENT_ID !== undefined &&
          env.AUTH_GOOGLE_CLIENT_SECRET !== undefined,
        github:
          env.AUTH_GITHUB_CLIENT_ID !== undefined &&
          env.AUTH_GITHUB_CLIENT_SECRET !== undefined,
        githubEnterprise:
          env.AUTH_GITHUB_ENTERPRISE_CLIENT_ID !== undefined &&
          env.AUTH_GITHUB_ENTERPRISE_CLIENT_SECRET !== undefined &&
          env.AUTH_GITHUB_ENTERPRISE_BASE_URL !== undefined,
        gitlab:
          env.AUTH_GITLAB_CLIENT_ID !== undefined &&
          env.AUTH_GITLAB_CLIENT_SECRET !== undefined,
        okta:
          env.AUTH_OKTA_CLIENT_ID !== undefined &&
          env.AUTH_OKTA_CLIENT_SECRET !== undefined &&
          env.AUTH_OKTA_ISSUER !== undefined,
        authentik:
          env.AUTH_AUTHENTIK_CLIENT_ID !== undefined &&
          env.AUTH_AUTHENTIK_CLIENT_SECRET !== undefined &&
          env.AUTH_AUTHENTIK_ISSUER !== undefined,
        onelogin:
          env.AUTH_ONELOGIN_CLIENT_ID !== undefined &&
          env.AUTH_ONELOGIN_CLIENT_SECRET !== undefined &&
          env.AUTH_ONELOGIN_ISSUER !== undefined,
        credentials: env.AUTH_DISABLE_USERNAME_PASSWORD !== "true",
        azureAd:
          env.AUTH_AZURE_AD_CLIENT_ID !== undefined &&
          env.AUTH_AZURE_AD_CLIENT_SECRET !== undefined &&
          env.AUTH_AZURE_AD_TENANT_ID !== undefined,
        auth0:
          env.AUTH_AUTH0_CLIENT_ID !== undefined &&
          env.AUTH_AUTH0_CLIENT_SECRET !== undefined &&
          env.AUTH_AUTH0_ISSUER !== undefined,
        // Langfuse Cloud only — NOT for self-hosted Langfuse
        clickhouseCloud:
          env.AUTH_CLICKHOUSE_CLOUD_CLIENT_ID !== undefined &&
          env.AUTH_CLICKHOUSE_CLOUD_CLIENT_SECRET !== undefined &&
          env.AUTH_CLICKHOUSE_CLOUD_ISSUER !== undefined &&
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined,
        cognito:
          env.AUTH_COGNITO_CLIENT_ID !== undefined &&
          env.AUTH_COGNITO_CLIENT_SECRET !== undefined &&
          env.AUTH_COGNITO_ISSUER !== undefined,
        jumpcloud:
          env.AUTH_JUMPCLOUD_CLIENT_ID !== undefined &&
          env.AUTH_JUMPCLOUD_CLIENT_SECRET !== undefined &&
          env.AUTH_JUMPCLOUD_ISSUER !== undefined,
        keycloak:
          env.AUTH_KEYCLOAK_CLIENT_ID !== undefined &&
          env.AUTH_KEYCLOAK_CLIENT_SECRET !== undefined &&
          env.AUTH_KEYCLOAK_ISSUER !== undefined
            ? env.AUTH_KEYCLOAK_NAME !== undefined
              ? { name: env.AUTH_KEYCLOAK_NAME }
              : true
            : false,
        workos:
          env.AUTH_WORKOS_CLIENT_ID !== undefined &&
          env.AUTH_WORKOS_CLIENT_SECRET !== undefined
            ? env.AUTH_WORKOS_ORGANIZATION_ID !== undefined
              ? { organizationId: env.AUTH_WORKOS_ORGANIZATION_ID }
              : env.AUTH_WORKOS_CONNECTION_ID !== undefined
                ? { connectionId: env.AUTH_WORKOS_CONNECTION_ID }
                : true
            : false,
        wordpress:
          env.AUTH_WORDPRESS_CLIENT_ID !== undefined &&
          env.AUTH_WORDPRESS_CLIENT_SECRET !== undefined,
        custom:
          env.AUTH_CUSTOM_CLIENT_ID !== undefined &&
          env.AUTH_CUSTOM_CLIENT_SECRET !== undefined &&
          env.AUTH_CUSTOM_ISSUER !== undefined &&
          env.AUTH_CUSTOM_NAME !== undefined
            ? { name: env.AUTH_CUSTOM_NAME }
            : false,
        sso,
      },
      signUpDisabled: env.AUTH_DISABLE_SIGNUP === "true",
      emailVerificationRequired: isEmailVerificationRequired(),
      runningOnHuggingFaceSpaces: env.NEXTAUTH_URL?.replace(
        "/api/auth",
        "",
      ).endsWith(".hf.space"),
    },
  };
};
