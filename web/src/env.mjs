import { z } from "zod";
import { createEnv } from "@t3-oss/env-nextjs";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z.enum(["development", "test", "production"]),
    NEXTAUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string().min(1)
        : z.string().min(1).optional(),
    SEED_SECRET_KEY: z.string().min(1).optional(),
    NEXTAUTH_URL: z.preprocess(
      // This makes Vercel deployments not fail if you don't set NEXTAUTH_URL
      // Since NextAuth.js automatically uses the VERCEL_URL if present.
      (str) =>
        process.env.VERCEL_URL && process.env.VERCEL_URL !== ""
          ? process.env.VERCEL_URL
          : str,
      // VERCEL_URL doesn't include `https` so it can't be validated as a URL
      process.env.VERCEL ? z.string().min(1) : z.string().url(),
    ),
    NEXTAUTH_COOKIE_DOMAIN: z.string().optional(),
    LANGFUSE_TEAM_SLACK_WEBHOOK: z.string().url().optional(),
    LANGFUSE_TEAM_BETTERSTACK_TOKEN: z.string().optional(),
    LANGFUSE_NEW_USER_SIGNUP_WEBHOOK: z.string().url().optional(),
    // Add `.min(1) on ID and SECRET if you want to make sure they're not empty
    LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: z.enum(["true", "false"]).optional(),
    LANGFUSE_DEFAULT_TABLE_DATETIME_OFFSET: z
      .string()
      .optional()
      .refine((v) => v === undefined || !isNaN(Number.parseInt(v)), {
        message:
          "LANGFUSE_DEFAULT_TABLE_DATETIME_OFFSET must be a number when set",
      })
      .transform(
        (v) => (v === undefined ? undefined : -Number.parseInt(v)), // negative offset
      ),
    LANGFUSE_DISABLE_EXPENSIVE_POSTGRES_QUERIES: z
      .enum(["true", "false"])
      .optional()
      .default("false"),
    SALT: z.string({
      required_error:
        "A strong Salt is required to encrypt API keys securely. See: https://langfuse.com/docs/deployment/self-host#deploy-the-container",
    }),
    // Add newly signed up users to default project with role
    LANGFUSE_DEFAULT_PROJECT_ID: z.string().optional(),
    LANGFUSE_DEFAULT_PROJECT_ROLE: z
      .enum(["ADMIN", "MEMBER", "VIEWER"])
      .optional(),
    LANGFUSE_CSP_ENFORCE_HTTPS: z.enum(["true", "false"]).optional(),
    // AUTH
    AUTH_GOOGLE_CLIENT_ID: z.string().optional(),
    AUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
    AUTH_GOOGLE_ALLOWED_DOMAINS: z.string().optional(),
    AUTH_GOOGLE_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_GITHUB_CLIENT_ID: z.string().optional(),
    AUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
    AUTH_GITHUB_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_AZURE_AD_CLIENT_ID: z.string().optional(),
    AUTH_AZURE_AD_CLIENT_SECRET: z.string().optional(),
    AUTH_AZURE_AD_TENANT_ID: z.string().optional(),
    AUTH_AZURE_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_OKTA_CLIENT_ID: z.string().optional(),
    AUTH_OKTA_CLIENT_SECRET: z.string().optional(),
    AUTH_OKTA_ISSUER: z.string().optional(),
    AUTH_OKTA_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_AUTH0_CLIENT_ID: z.string().optional(),
    AUTH_AUTH0_CLIENT_SECRET: z.string().optional(),
    AUTH_AUTH0_ISSUER: z.string().url().optional(),
    AUTH_AUTH0_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_COGNITO_CLIENT_ID: z.string().optional(),
    AUTH_COGNITO_CLIENT_SECRET: z.string().optional(),
    AUTH_COGNITO_ISSUER: z.string().url().optional(),
    AUTH_COGNITO_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_CUSTOM_CLIENT_ID: z.string().optional(),
    AUTH_CUSTOM_CLIENT_SECRET: z.string().optional(),
    AUTH_CUSTOM_ISSUER: z.string().url().optional(),
    AUTH_CUSTOM_NAME: z.string().optional(),
    AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_DOMAINS_WITH_SSO_ENFORCEMENT: z.string().optional(),
    AUTH_DISABLE_USERNAME_PASSWORD: z.enum(["true", "false"]).optional(),
    AUTH_DISABLE_SIGNUP: z.enum(["true", "false"]).optional(),
    // EMAIL
    EMAIL_FROM_ADDRESS: z.string().optional().transform((v) => v === "" ? undefined : v),
    SMTP_CONNECTION_URL: z.string().optional().transform((v) => v === "" ? undefined : v),
    // S3
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_BUCKET_NAME: z.string().optional(),
    S3_REGION: z.string().optional(),
    // Database exports
    DB_EXPORT_PAGE_SIZE: z.number().optional(),
    // Worker
    LANGFUSE_WORKER_HOST: z.string().optional(),
    LANGFUSE_WORKER_PASSWORD: z.string().optional(),
    TURNSTILE_SECRET_KEY: z.string().optional(),
    // DB event log
    ENABLE_EVENT_LOG: z.enum(["true", "false"]).optional().default("true"),
    // EE License
    LANGFUSE_EE_LICENSE_KEY: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   *
   * WARNING: They do not work when used in Docker builds as NEXT_PUBLIC variables are not runtime but compile-time.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string().min(1),
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: z
      .enum(["US", "EU", "STAGING", "DEV"])
      .optional(),
    NEXT_PUBLIC_DEMO_PROJECT_ID: z.string().optional(),
    NEXT_PUBLIC_SIGN_UP_DISABLED: z.enum(["true", "false"]).optional(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
    NEXT_PUBLIC_CRISP_WEBSITE_ID: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    SEED_SECRET_KEY: process.env.SEED_SECRET_KEY,
    NEXT_PUBLIC_DEMO_PROJECT_ID: process.env.NEXT_PUBLIC_DEMO_PROJECT_ID,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_COOKIE_DOMAIN: process.env.NEXTAUTH_COOKIE_DOMAIN,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION:
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    NEXT_PUBLIC_SIGN_UP_DISABLED: process.env.NEXT_PUBLIC_SIGN_UP_DISABLED,
    LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES:
      process.env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES,
    LANGFUSE_DEFAULT_TABLE_DATETIME_OFFSET:
      process.env.LANGFUSE_DEFAULT_TABLE_DATETIME_OFFSET,
    LANGFUSE_DISABLE_EXPENSIVE_POSTGRES_QUERIES:
      process.env.LANGFUSE_DISABLE_EXPENSIVE_POSTGRES_QUERIES,
    LANGFUSE_TEAM_SLACK_WEBHOOK: process.env.LANGFUSE_TEAM_SLACK_WEBHOOK,
    LANGFUSE_TEAM_BETTERSTACK_TOKEN:
      process.env.LANGFUSE_TEAM_BETTERSTACK_TOKEN,
    LANGFUSE_NEW_USER_SIGNUP_WEBHOOK:
      process.env.LANGFUSE_NEW_USER_SIGNUP_WEBHOOK,
    SALT: process.env.SALT,
    LANGFUSE_CSP_ENFORCE_HTTPS: process.env.LANGFUSE_CSP_ENFORCE_HTTPS,
    // Default project and role
    LANGFUSE_DEFAULT_PROJECT_ID: process.env.LANGFUSE_DEFAULT_PROJECT_ID,
    LANGFUSE_DEFAULT_PROJECT_ROLE: process.env.LANGFUSE_DEFAULT_PROJECT_ROLE,
    // AUTH
    AUTH_GOOGLE_CLIENT_ID: process.env.AUTH_GOOGLE_CLIENT_ID,
    AUTH_GOOGLE_CLIENT_SECRET: process.env.AUTH_GOOGLE_CLIENT_SECRET,
    AUTH_GOOGLE_ALLOWED_DOMAINS: process.env.AUTH_GOOGLE_ALLOWED_DOMAINS,
    AUTH_GOOGLE_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_GOOGLE_ALLOW_ACCOUNT_LINKING,
    AUTH_GITHUB_CLIENT_ID: process.env.AUTH_GITHUB_CLIENT_ID,
    AUTH_GITHUB_CLIENT_SECRET: process.env.AUTH_GITHUB_CLIENT_SECRET,
    AUTH_GITHUB_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_GITHUB_ALLOW_ACCOUNT_LINKING,
    AUTH_AZURE_AD_CLIENT_ID: process.env.AUTH_AZURE_AD_CLIENT_ID,
    AUTH_AZURE_AD_CLIENT_SECRET: process.env.AUTH_AZURE_AD_CLIENT_SECRET,
    AUTH_AZURE_AD_TENANT_ID: process.env.AUTH_AZURE_AD_TENANT_ID,
    AUTH_AZURE_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_AZURE_ALLOW_ACCOUNT_LINKING,
    AUTH_OKTA_CLIENT_ID: process.env.AUTH_OKTA_CLIENT_ID,
    AUTH_OKTA_CLIENT_SECRET: process.env.AUTH_OKTA_CLIENT_SECRET,
    AUTH_OKTA_ISSUER: process.env.AUTH_OKTA_ISSUER,
    AUTH_OKTA_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_OKTA_ALLOW_ACCOUNT_LINKING,
    AUTH_AUTH0_CLIENT_ID: process.env.AUTH_AUTH0_CLIENT_ID,
    AUTH_AUTH0_CLIENT_SECRET: process.env.AUTH_AUTH0_CLIENT_SECRET,
    AUTH_AUTH0_ISSUER: process.env.AUTH_AUTH0_ISSUER,
    AUTH_AUTH0_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_AUTH0_ALLOW_ACCOUNT_LINKING,
    AUTH_COGNITO_CLIENT_ID: process.env.AUTH_COGNITO_CLIENT_ID,
    AUTH_COGNITO_CLIENT_SECRET: process.env.AUTH_COGNITO_CLIENT_SECRET,
    AUTH_COGNITO_ISSUER: process.env.AUTH_COGNITO_ISSUER,
    AUTH_COGNITO_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_COGNITO_ALLOW_ACCOUNT_LINKING,
    AUTH_CUSTOM_CLIENT_ID: process.env.AUTH_CUSTOM_CLIENT_ID,
    AUTH_CUSTOM_CLIENT_SECRET: process.env.AUTH_CUSTOM_CLIENT_SECRET,
    AUTH_CUSTOM_ISSUER: process.env.AUTH_CUSTOM_ISSUER,
    AUTH_CUSTOM_NAME: process.env.AUTH_CUSTOM_NAME,
    AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING,
    AUTH_DOMAINS_WITH_SSO_ENFORCEMENT:
      process.env.AUTH_DOMAINS_WITH_SSO_ENFORCEMENT,
    AUTH_DISABLE_USERNAME_PASSWORD: process.env.AUTH_DISABLE_USERNAME_PASSWORD,
    AUTH_DISABLE_SIGNUP: process.env.AUTH_DISABLE_SIGNUP,
    // Email
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    SMTP_CONNECTION_URL: process.env.SMTP_CONNECTION_URL,
    // S3
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    S3_REGION: process.env.S3_REGION,
    // Database exports
    DB_EXPORT_PAGE_SIZE: process.env.DB_EXPORT_PAGE_SIZE,
    // Worker
    LANGFUSE_WORKER_HOST: process.env.LANGFUSE_WORKER_HOST,
    LANGFUSE_WORKER_PASSWORD: process.env.LANGFUSE_WORKER_PASSWORD,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    // Other
    NEXT_PUBLIC_CRISP_WEBSITE_ID: process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID,
    // db event log
    ENABLE_EVENT_LOG: process.env.ENABLE_EVENT_LOG,
    // EE License
    LANGFUSE_EE_LICENSE_KEY: process.env.LANGFUSE_EE_LICENSE_KEY,
  },
  // Skip validation in Docker builds
  // DOCKER_BUILD is set in Dockerfile
  skipValidation: process.env.DOCKER_BUILD === "1",
});
