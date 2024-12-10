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
    LANGFUSE_DISABLE_EXPENSIVE_POSTGRES_QUERIES: z
      .enum(["true", "false"])
      .optional()
      .default("false"),
    SALT: z.string({
      required_error:
        "A strong Salt is required to encrypt API keys securely. See: https://langfuse.com/docs/deployment/self-host#deploy-the-container",
    }),
    // Add newly signed up users to default org and/or project with role
    LANGFUSE_DEFAULT_ORG_ID: z.string().optional(),
    LANGFUSE_DEFAULT_ORG_ROLE: z
      .enum(["OWNER", "ADMIN", "MEMBER", "VIEWER", "NONE"])
      .optional(),
    LANGFUSE_DEFAULT_PROJECT_ID: z.string().optional(),
    LANGFUSE_DEFAULT_PROJECT_ROLE: z
      .enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"])
      .optional(),
    LANGFUSE_CSP_ENFORCE_HTTPS: z
      .enum(["true", "false"])
      .optional()
      .default("false"),
    // Telemetry
    TELEMETRY_ENABLED: z.enum(["true", "false"]).optional(),
    // AUTH
    AUTH_GOOGLE_CLIENT_ID: z.string().optional(),
    AUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
    AUTH_GOOGLE_ALLOWED_DOMAINS: z.string().optional(),
    AUTH_GOOGLE_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_GITHUB_CLIENT_ID: z.string().optional(),
    AUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
    AUTH_GITHUB_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_GITHUB_ENTERPRISE_CLIENT_ID: z.string().optional(),
    AUTH_GITHUB_ENTERPRISE_CLIENT_SECRET: z.string().optional(),
    AUTH_GITHUB_ENTERPRISE_BASE_URL: z.string().optional(),
    AUTH_GITHUB_ENTERPRISE_ALLOW_ACCOUNT_LINKING: z
      .enum(["true", "false"])
      .optional(),
    AUTH_GITLAB_CLIENT_ID: z.string().optional(),
    AUTH_GITLAB_CLIENT_SECRET: z.string().optional(),
    AUTH_GITLAB_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_GITLAB_ISSUER: z.string().optional(),
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
    AUTH_KEYCLOAK_CLIENT_ID: z.string().optional(),
    AUTH_KEYCLOAK_CLIENT_SECRET: z.string().optional(),
    AUTH_KEYCLOAK_ISSUER: z.string().optional(),
    AUTH_KEYCLOAK_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_CUSTOM_CLIENT_ID: z.string().optional(),
    AUTH_CUSTOM_CLIENT_SECRET: z.string().optional(),
    AUTH_CUSTOM_ISSUER: z.string().url().optional(),
    AUTH_CUSTOM_NAME: z.string().optional(),
    AUTH_CUSTOM_SCOPE: z.string().optional(),
    AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_DOMAINS_WITH_SSO_ENFORCEMENT: z.string().optional(),
    AUTH_DISABLE_USERNAME_PASSWORD: z.enum(["true", "false"]).optional(),
    AUTH_DISABLE_SIGNUP: z.enum(["true", "false"]).optional(),
    AUTH_SESSION_MAX_AGE: z.coerce
      .number()
      .int()
      .gt(
        5,
        "AUTH_SESSION_MAX_AGE must be > 5 as session JWT tokens are refreshed every 5 minutes",
      )
      .optional()
      .default(30 * 24 * 60), // default to 30 days
    // EMAIL
    EMAIL_FROM_ADDRESS: z.string().optional(),
    SMTP_CONNECTION_URL: z.string().optional(),

    // S3 Batch Export
    LANGFUSE_S3_BATCH_EXPORT_ENABLED: z
      .enum(["true", "false"])
      .default("false"),
    LANGFUSE_S3_BATCH_EXPORT_BUCKET: z.string().optional(),
    LANGFUSE_S3_BATCH_EXPORT_PREFIX: z.string().default(""),
    LANGFUSE_S3_BATCH_EXPORT_REGION: z.string().optional(),
    LANGFUSE_S3_BATCH_EXPORT_ENDPOINT: z.string().optional(),
    LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID: z.string().optional(),
    LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY: z.string().optional(),
    LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false"),

    // Database exports
    DB_EXPORT_PAGE_SIZE: z.number().optional(),

    TURNSTILE_SECRET_KEY: z.string().optional(),

    // Otel
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default("http://localhost:4318"),
    OTEL_SERVICE_NAME: z.string().default("web"),
    OTEL_TRACE_SAMPLING_RATIO: z.coerce.number().gt(0).lte(1).default(1),

    // clickhouse
    CLICKHOUSE_URL: z.string().url(),
    CLICKHOUSE_USER: z.string(),
    CLICKHOUSE_PASSWORD: z.string(),
    CLICKHOUSE_CLUSTER_ENABLED: z.enum(["true", "false"]).default("false"),

    // EE ui customization
    LANGFUSE_UI_API_HOST: z.string().optional(),
    LANGFUSE_UI_DOCUMENTATION_HREF: z.string().url().optional(),
    LANGFUSE_UI_SUPPORT_HREF: z.string().url().optional(),
    LANGFUSE_UI_FEEDBACK_HREF: z.string().url().optional(),
    LANGFUSE_UI_LOGO_LIGHT_MODE_HREF: z.string().url().optional(),
    LANGFUSE_UI_LOGO_DARK_MODE_HREF: z.string().url().optional(),
    LANGFUSE_UI_DEFAULT_MODEL_ADAPTER: z
      .enum(["OpenAI", "Anthropic", "Azure"])
      .optional(),
    LANGFUSE_UI_DEFAULT_BASE_URL_OPENAI: z.string().url().optional(),
    LANGFUSE_UI_DEFAULT_BASE_URL_ANTHROPIC: z.string().url().optional(),
    LANGFUSE_UI_DEFAULT_BASE_URL_AZURE: z.string().url().optional(),

    // EE License
    LANGFUSE_EE_LICENSE_KEY: z.string().optional(),
    ADMIN_API_KEY: z.string().optional(),
    ENCRYPTION_KEY: z
      .string()
      .length(
        64,
        "ENCRYPTION_KEY must be 256 bits, 64 string characters in hex format, generate via: openssl rand -hex 32",
      )
      .optional(),

    REDIS_HOST: z.string().nullish(),
    REDIS_PORT: z.coerce
      .number({
        description:
          ".env files convert numbers to strings, therefoore we have to enforce them to be numbers",
      })
      .positive()
      .max(65536, `options.port should be >= 0 and < 65536`)
      .default(6379)
      .nullable(),
    REDIS_AUTH: z.string().nullish(),
    REDIS_CONNECTION_STRING: z.string().nullish(),
    REDIS_ENABLE_AUTO_PIPELINING: z.enum(["true", "false"]).default("true"),

    // langfuse caching
    LANGFUSE_CACHE_API_KEY_ENABLED: z.enum(["true", "false"]).default("false"),
    LANGFUSE_CACHE_API_KEY_TTL_SECONDS: z.coerce.number().default(120),

    // Multimodal media upload to S3
    LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH: z.coerce
      .number()
      .positive()
      .int()
      .default(1_000_000_000),
    LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: z.string().optional(),
    LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: z.string().default(""),
    LANGFUSE_S3_MEDIA_UPLOAD_REGION: z.string().optional(),
    LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT: z.string().optional(),
    LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID: z.string().optional(),
    LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: z.string().optional(),
    LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false"),
    LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS: z.coerce
      .number()
      .nonnegative()
      .default(3600),

    LANGFUSE_ALLOWED_ORGANIZATION_CREATORS: z
      .string()
      .optional()
      .refine((value) => {
        if (!value) return true;
        const creators = value.split(",");
        const emailSchema = z.string().email();
        return creators.every(
          (creator) => emailSchema.safeParse(creator).success,
        );
      }, "LANGFUSE_ALLOWED_ORGANIZATION_CREATORS must be a comma separated list of valid email addresses"),

    // TODO: Remove entire block during V3 clean up
    // Settings to toggle Clickhouse vs Postgres behaviour
    LANGFUSE_READ_FROM_POSTGRES_ONLY: z
      .enum(["true", "false"])
      .default("false"),
    LANGFUSE_RETURN_FROM_CLICKHOUSE: z.enum(["true", "false"]).default("true"),
    LANGFUSE_EXPERIMENT_EXCLUDED_PROJECT_IDS: z.string().optional(),
    LANGFUSE_EXPERIMENT_EXCLUDED_OPERATIONS: z.string().optional(),
    LANGFUSE_READ_DASHBOARDS_FROM_CLICKHOUSE: z
      .enum(["true", "false"])
      .default("true"),
    LANGFUSE_READ_FROM_CLICKHOUSE_ONLY: z
      .enum(["true", "false"])
      .default("true"),
    LANGFUSE_POSTGRES_INGESTION_ENABLED: z
      .enum(["true", "false"])
      .default("false"),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SIGNING_SECRET: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_CSP_REPORT_URI: z.string().optional(),
    LANGFUSE_RATE_LIMITS_ENABLED: z.enum(["true", "false"]).default("true"),

    LANGFUSE_INIT_ORG_ID: z.string().optional(),
    LANGFUSE_INIT_ORG_NAME: z.string().optional(),
    LANGFUSE_INIT_PROJECT_ID: z.string().optional(),
    LANGFUSE_INIT_PROJECT_NAME: z.string().optional(),
    LANGFUSE_INIT_PROJECT_PUBLIC_KEY: z.string().optional(),
    LANGFUSE_INIT_PROJECT_SECRET_KEY: z.string().optional(),
    LANGFUSE_INIT_USER_EMAIL: z
      .union([z.string().email(), z.string().length(0)])
      .optional(),
    LANGFUSE_INIT_USER_NAME: z.string().optional(),
    LANGFUSE_INIT_USER_PASSWORD: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   *
   * WARNING: They do not work when used in Docker builds as NEXT_PUBLIC variables are not runtime but compile-time.
   */
  client: {
    // WARNING: Also add these to web/Dockerfile

    // NEXT_PUBLIC_CLIENTVAR: z.string().min(1),
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: z
      .enum(["US", "EU", "STAGING", "DEV"])
      .optional(),
    NEXT_PUBLIC_DEMO_PROJECT_ID: z.string().optional(),
    NEXT_PUBLIC_DEMO_ORG_ID: z.string().optional(),
    NEXT_PUBLIC_SIGN_UP_DISABLED: z.enum(["true", "false"]).default("false"),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
    NEXT_PUBLIC_CRISP_WEBSITE_ID: z.string().optional(),
    NEXT_PUBLIC_BUILD_ID: z.string().optional(),
    NEXT_PUBLIC_BASE_PATH: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    SEED_SECRET_KEY: process.env.SEED_SECRET_KEY,
    NEXT_PUBLIC_DEMO_PROJECT_ID: process.env.NEXT_PUBLIC_DEMO_PROJECT_ID,
    NEXT_PUBLIC_DEMO_ORG_ID: process.env.NEXT_PUBLIC_DEMO_ORG_ID,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_COOKIE_DOMAIN: process.env.NEXTAUTH_COOKIE_DOMAIN,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION:
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    NEXT_PUBLIC_SIGN_UP_DISABLED: process.env.NEXT_PUBLIC_SIGN_UP_DISABLED,
    LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES:
      process.env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES,
    LANGFUSE_EXPERIMENT_EXCLUDED_OPERATIONS:
      process.env.LANGFUSE_EXPERIMENT_EXCLUDED_OPERATIONS,
    LANGFUSE_DISABLE_EXPENSIVE_POSTGRES_QUERIES:
      process.env.LANGFUSE_DISABLE_EXPENSIVE_POSTGRES_QUERIES,
    LANGFUSE_TEAM_SLACK_WEBHOOK: process.env.LANGFUSE_TEAM_SLACK_WEBHOOK,
    LANGFUSE_NEW_USER_SIGNUP_WEBHOOK:
      process.env.LANGFUSE_NEW_USER_SIGNUP_WEBHOOK,
    SALT: process.env.SALT,
    LANGFUSE_CSP_ENFORCE_HTTPS: process.env.LANGFUSE_CSP_ENFORCE_HTTPS,
    TELEMETRY_ENABLED: process.env.TELEMETRY_ENABLED,
    // Default org, project and role
    LANGFUSE_DEFAULT_ORG_ID: process.env.LANGFUSE_DEFAULT_ORG_ID,
    LANGFUSE_DEFAULT_ORG_ROLE: process.env.LANGFUSE_DEFAULT_ORG_ROLE,
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
    AUTH_GITHUB_ENTERPRISE_CLIENT_ID:
      process.env.AUTH_GITHUB_ENTERPRISE_CLIENT_ID,
    AUTH_GITHUB_ENTERPRISE_CLIENT_SECRET:
      process.env.AUTH_GITHUB_ENTERPRISE_CLIENT_SECRET,
    AUTH_GITHUB_ENTERPRISE_BASE_URL:
      process.env.AUTH_GITHUB_ENTERPRISE_BASE_URL,
    AUTH_GITHUB_ENTERPRISE_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_GITHUB_ENTERPRISE_ALLOW_ACCOUNT_LINKING,
    AUTH_GITLAB_ISSUER: process.env.AUTH_GITLAB_ISSUER,
    AUTH_GITLAB_CLIENT_ID: process.env.AUTH_GITLAB_CLIENT_ID,
    AUTH_GITLAB_CLIENT_SECRET: process.env.AUTH_GITLAB_CLIENT_SECRET,
    AUTH_GITLAB_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_GITLAB_ALLOW_ACCOUNT_LINKING,
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
    AUTH_KEYCLOAK_CLIENT_ID: process.env.AUTH_KEYCLOAK_CLIENT_ID,
    AUTH_KEYCLOAK_CLIENT_SECRET: process.env.AUTH_KEYCLOAK_CLIENT_SECRET,
    AUTH_KEYCLOAK_ISSUER: process.env.AUTH_KEYCLOAK_ISSUER,
    AUTH_KEYCLOAK_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_KEYCLOAK_ALLOW_ACCOUNT_LINKING,
    AUTH_CUSTOM_CLIENT_ID: process.env.AUTH_CUSTOM_CLIENT_ID,
    AUTH_CUSTOM_CLIENT_SECRET: process.env.AUTH_CUSTOM_CLIENT_SECRET,
    AUTH_CUSTOM_ISSUER: process.env.AUTH_CUSTOM_ISSUER,
    AUTH_CUSTOM_NAME: process.env.AUTH_CUSTOM_NAME,
    AUTH_CUSTOM_SCOPE: process.env.AUTH_CUSTOM_SCOPE,
    AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING,
    AUTH_DOMAINS_WITH_SSO_ENFORCEMENT:
      process.env.AUTH_DOMAINS_WITH_SSO_ENFORCEMENT,
    AUTH_DISABLE_USERNAME_PASSWORD: process.env.AUTH_DISABLE_USERNAME_PASSWORD,
    AUTH_DISABLE_SIGNUP: process.env.AUTH_DISABLE_SIGNUP,
    AUTH_SESSION_MAX_AGE: process.env.AUTH_SESSION_MAX_AGE,
    // Email
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    SMTP_CONNECTION_URL: process.env.SMTP_CONNECTION_URL,
    // Otel
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
    OTEL_TRACE_SAMPLING_RATIO: process.env.OTEL_TRACE_SAMPLING_RATIO,

    // S3 Batch Export
    LANGFUSE_S3_BATCH_EXPORT_ENABLED:
      process.env.LANGFUSE_S3_BATCH_EXPORT_ENABLED,
    LANGFUSE_S3_BATCH_EXPORT_BUCKET:
      process.env.LANGFUSE_S3_BATCH_EXPORT_BUCKET,
    LANGFUSE_S3_BATCH_EXPORT_PREFIX:
      process.env.LANGFUSE_S3_BATCH_EXPORT_PREFIX,
    LANGFUSE_S3_BATCH_EXPORT_REGION:
      process.env.LANGFUSE_S3_BATCH_EXPORT_REGION,
    LANGFUSE_S3_BATCH_EXPORT_ENDPOINT:
      process.env.LANGFUSE_S3_BATCH_EXPORT_ENDPOINT,
    LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID:
      process.env.LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID,
    LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY:
      process.env.LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY,
    LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE:
      process.env.LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE,

    // S3 media upload
    LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH:
      process.env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH,
    LANGFUSE_S3_MEDIA_UPLOAD_BUCKET:
      process.env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
    LANGFUSE_S3_MEDIA_UPLOAD_PREFIX:
      process.env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX,
    LANGFUSE_S3_MEDIA_UPLOAD_REGION:
      process.env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
    LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT:
      process.env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
    LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID:
      process.env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
    LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY:
      process.env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
    LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE:
      process.env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE,
    LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS:
      process.env.LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS,
    // Database exports
    DB_EXPORT_PAGE_SIZE: process.env.DB_EXPORT_PAGE_SIZE,
    // Worker
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    // Other
    NEXT_PUBLIC_CRISP_WEBSITE_ID: process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID,
    // clickhouse
    CLICKHOUSE_URL: process.env.CLICKHOUSE_URL,
    CLICKHOUSE_USER: process.env.CLICKHOUSE_USER,
    CLICKHOUSE_PASSWORD: process.env.CLICKHOUSE_PASSWORD,
    CLICKHOUSE_CLUSTER_ENABLED: process.env.CLICKHOUSE_CLUSTER_ENABLED,
    // EE ui customization
    LANGFUSE_UI_API_HOST: process.env.LANGFUSE_UI_API_HOST,
    LANGFUSE_UI_DOCUMENTATION_HREF: process.env.LANGFUSE_UI_DOCUMENTATION_HREF,
    LANGFUSE_UI_SUPPORT_HREF: process.env.LANGFUSE_UI_SUPPORT_HREF,
    LANGFUSE_UI_FEEDBACK_HREF: process.env.LANGFUSE_UI_FEEDBACK_HREF,
    LANGFUSE_UI_LOGO_LIGHT_MODE_HREF:
      process.env.LANGFUSE_UI_LOGO_LIGHT_MODE_HREF,
    LANGFUSE_UI_LOGO_DARK_MODE_HREF:
      process.env.LANGFUSE_UI_LOGO_DARK_MODE_HREF,
    LANGFUSE_UI_DEFAULT_MODEL_ADAPTER:
      process.env.LANGFUSE_UI_DEFAULT_MODEL_ADAPTER,
    LANGFUSE_UI_DEFAULT_BASE_URL_OPENAI:
      process.env.LANGFUSE_UI_DEFAULT_BASE_URL_OPENAI,
    LANGFUSE_UI_DEFAULT_BASE_URL_ANTHROPIC:
      process.env.LANGFUSE_UI_DEFAULT_BASE_URL_ANTHROPIC,
    LANGFUSE_UI_DEFAULT_BASE_URL_AZURE:
      process.env.LANGFUSE_UI_DEFAULT_BASE_URL_AZURE,
    // EE License
    LANGFUSE_EE_LICENSE_KEY: process.env.LANGFUSE_EE_LICENSE_KEY,
    ADMIN_API_KEY: process.env.ADMIN_API_KEY,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_AUTH: process.env.REDIS_AUTH,
    REDIS_CONNECTION_STRING: process.env.REDIS_CONNECTION_STRING,
    REDIS_ENABLE_AUTO_PIPELINING: process.env.REDIS_ENABLE_AUTO_PIPELINING,
    // langfuse caching
    LANGFUSE_CACHE_API_KEY_ENABLED: process.env.LANGFUSE_CACHE_API_KEY_ENABLED,
    LANGFUSE_CACHE_API_KEY_TTL_SECONDS:
      process.env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS,
    LANGFUSE_ALLOWED_ORGANIZATION_CREATORS:
      process.env.LANGFUSE_ALLOWED_ORGANIZATION_CREATORS,
    LANGFUSE_READ_FROM_POSTGRES_ONLY:
      process.env.LANGFUSE_READ_FROM_POSTGRES_ONLY,
    LANGFUSE_POSTGRES_INGESTION_ENABLED:
      process.env.LANGFUSE_POSTGRES_INGESTION_ENABLED,
    LANGFUSE_READ_FROM_CLICKHOUSE_ONLY:
      process.env.LANGFUSE_READ_FROM_CLICKHOUSE_ONLY,
    LANGFUSE_RETURN_FROM_CLICKHOUSE:
      process.env.LANGFUSE_RETURN_FROM_CLICKHOUSE,
    LANGFUSE_EXPERIMENT_EXCLUDED_PROJECT_IDS:
      process.env.LANGFUSE_EXPERIMENT_EXCLUDED_PROJECT_IDS,
    LANGFUSE_READ_DASHBOARDS_FROM_CLICKHOUSE:
      process.env.LANGFUSE_READ_DASHBOARDS_FROM_CLICKHOUSE,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SIGNING_SECRET: process.env.STRIPE_WEBHOOK_SIGNING_SECRET,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_CSP_REPORT_URI: process.env.SENTRY_CSP_REPORT_URI,
    LANGFUSE_RATE_LIMITS_ENABLED: process.env.LANGFUSE_RATE_LIMITS_ENABLED,
    // provisioning
    LANGFUSE_INIT_ORG_ID: process.env.LANGFUSE_INIT_ORG_ID,
    LANGFUSE_INIT_ORG_NAME: process.env.LANGFUSE_INIT_ORG_NAME,
    LANGFUSE_INIT_PROJECT_ID: process.env.LANGFUSE_INIT_PROJECT_ID,
    LANGFUSE_INIT_PROJECT_NAME: process.env.LANGFUSE_INIT_PROJECT_NAME,
    LANGFUSE_INIT_PROJECT_PUBLIC_KEY:
      process.env.LANGFUSE_INIT_PROJECT_PUBLIC_KEY,
    LANGFUSE_INIT_PROJECT_SECRET_KEY:
      process.env.LANGFUSE_INIT_PROJECT_SECRET_KEY,
    LANGFUSE_INIT_USER_EMAIL: process.env.LANGFUSE_INIT_USER_EMAIL,
    LANGFUSE_INIT_USER_NAME: process.env.LANGFUSE_INIT_USER_NAME,
    LANGFUSE_INIT_USER_PASSWORD: process.env.LANGFUSE_INIT_USER_PASSWORD,
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH,
  },
  // Skip validation in Docker builds
  // DOCKER_BUILD is set in Dockerfile
  skipValidation: process.env.DOCKER_BUILD === "1",
  emptyStringAsUndefined: true, // https://env.t3.gg/docs/customization#treat-empty-strings-as-undefined
});
