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
    LANGFUSE_NEW_USER_SIGNUP_WEBHOOK: z.string().url().optional(),
    // Add `.min(1) on ID and SECRET if you want to make sure they're not empty
    LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: z.enum(["true", "false"]).optional(),
    SALT: z.string({
      required_error:
        "A strong Salt is required to encrypt API keys securely. See: https://langfuse.com/docs/deployment/self-host#deploy-the-container",
    }),
    // AUTH
    AUTH_GOOGLE_CLIENT_ID: z.string().optional(),
    AUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
    AUTH_GITHUB_CLIENT_ID: z.string().optional(),
    AUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
    AUTH_DOMAINS_WITH_SSO_ENFORCEMENT: z.string().optional(),
    AUTH_DISABLE_USERNAME_PASSWORD: z.enum(["true", "false"]).optional(),
    // EMAIL
    EMAIL_TRANSPORT_CHANNEL: z.string(),
    EMAIL_FROM_NAME: z.string(),
    EMAIL_FROM_ADDRESS: z.string(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_SECURE: z.string().optional(),
    SMTP_AUTH_USERNAME: z.string().optional(),
    SMTP_AUTH_PASSWORD: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string().min(1),
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: z.enum(["US", "EU", "STAGING"]).optional(),
    NEXT_PUBLIC_DEMO_PROJECT_ID: z.string().optional(),
    NEXT_PUBLIC_SIGN_UP_DISABLED: z.enum(["true", "false"]).optional(),
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
    LANGFUSE_TEAM_SLACK_WEBHOOK: process.env.LANGFUSE_TEAM_SLACK_WEBHOOK,
    LANGFUSE_NEW_USER_SIGNUP_WEBHOOK:
      process.env.LANGFUSE_NEW_USER_SIGNUP_WEBHOOK,
    SALT: process.env.SALT,
    // AUTH
    AUTH_GOOGLE_CLIENT_ID: process.env.AUTH_GOOGLE_CLIENT_ID,
    AUTH_GOOGLE_CLIENT_SECRET: process.env.AUTH_GOOGLE_CLIENT_SECRET,
    AUTH_GITHUB_CLIENT_ID: process.env.AUTH_GITHUB_CLIENT_ID,
    AUTH_GITHUB_CLIENT_SECRET: process.env.AUTH_GITHUB_CLIENT_SECRET,
    AUTH_DOMAINS_WITH_SSO_ENFORCEMENT:
      process.env.AUTH_DOMAINS_WITH_SSO_ENFORCEMENT,
    AUTH_DISABLE_USERNAME_PASSWORD: process.env.AUTH_DISABLE_USERNAME_PASSWORD,
    // Email
    EMAIL_TRANSPORT_CHANNEL: process.env.EMAIL_TRANSPORT_CHANNEL,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_AUTH_USERNAME: process.env.SMTP_AUTH_USERNAME,
    SMTP_AUTH_PASSWORD: process.env.SMTP_AUTH_PASSWORD,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  },
});
