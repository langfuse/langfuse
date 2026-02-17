import { z } from "zod";
import { createEnv } from "@t3-oss/env-nextjs";

const zAuthMethod = z
  .enum([
    "client_secret_basic",
    "client_secret_post",
    "client_secret_jwt",
    "private_key_jwt",
    "tls_client_auth",
    "self_signed_tls_client_auth",
    "none",
  ])
  .optional()
  .default("client_secret_basic");

const zAuthChecks = z
  .string()
  .optional()
  .transform((s) => s?.split(",").map((s) => s.trim()))
  .pipe(z.array(z.enum(["nonce", "none", "pkce", "state"])).optional());

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z.enum(["development", "test", "production"]),
    BUILD_ID: z.string().optional(),
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
        "A strong Salt is required to encrypt API keys securely. See: https://langfuse.com/self-hosting#deploy-the-container",
    }),
    // Add newly signed up users to default org(s) and/or project(s) with role
    // Supports comma-separated IDs for multiple orgs/projects (e.g., "org1,org2,org3")
    LANGFUSE_DEFAULT_ORG_ID: z
      .string()
      .optional()
      .transform((val) =>
        val
          ? val
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean)
          : undefined,
      ),
    LANGFUSE_DEFAULT_ORG_ROLE: z
      .enum(["OWNER", "ADMIN", "MEMBER", "VIEWER", "NONE"])
      .optional(),
    LANGFUSE_DEFAULT_PROJECT_ID: z
      .string()
      .optional()
      .transform((val) =>
        val
          ? val
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean)
          : undefined,
      ),
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
    AUTH_GOOGLE_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_GOOGLE_CHECKS: zAuthChecks,
    AUTH_GITHUB_CLIENT_ID: z.string().optional(),
    AUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
    AUTH_GITHUB_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_GITHUB_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_GITHUB_CHECKS: zAuthChecks,
    AUTH_GITHUB_ENTERPRISE_CLIENT_ID: z.string().optional(),
    AUTH_GITHUB_ENTERPRISE_CLIENT_SECRET: z.string().optional(),
    AUTH_GITHUB_ENTERPRISE_BASE_URL: z.string().optional(),
    AUTH_GITHUB_ENTERPRISE_ALLOW_ACCOUNT_LINKING: z
      .enum(["true", "false"])
      .optional(),
    AUTH_GITHUB_ENTERPRISE_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_GITHUB_ENTERPRISE_CHECKS: zAuthChecks,
    AUTH_GITLAB_CLIENT_ID: z.string().optional(),
    AUTH_GITLAB_CLIENT_SECRET: z.string().optional(),
    AUTH_GITLAB_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_GITLAB_ISSUER: z.string().optional(),
    AUTH_GITLAB_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_GITLAB_CHECKS: zAuthChecks,
    AUTH_GITLAB_URL: z.string().url().optional().default("https://gitlab.com"),
    AUTH_AZURE_AD_CLIENT_ID: z.string().optional(),
    AUTH_AZURE_AD_CLIENT_SECRET: z.string().optional(),
    AUTH_AZURE_AD_TENANT_ID: z.string().optional(),
    AUTH_AZURE_AD_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_AZURE_AD_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_AZURE_AD_CHECKS: zAuthChecks,
    AUTH_OKTA_CLIENT_ID: z.string().optional(),
    AUTH_OKTA_CLIENT_SECRET: z.string().optional(),
    AUTH_OKTA_ISSUER: z.string().optional(),
    AUTH_OKTA_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_OKTA_CHECKS: zAuthChecks,
    AUTH_OKTA_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_AUTHENTIK_CLIENT_ID: z.string().optional(),
    AUTH_AUTHENTIK_CLIENT_SECRET: z.string().optional(),
    AUTH_AUTHENTIK_ISSUER: z
      .string()
      .regex(/^https:\/\/.+\/application\/o\/[^/]+$/, {
        message:
          "Authentik issuer must be in format https://<domain>/application/o/<slug> without trailing slash",
      })
      .optional(),
    AUTH_AUTHENTIK_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_AUTHENTIK_CHECKS: zAuthChecks,
    AUTH_AUTHENTIK_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_ONELOGIN_CLIENT_ID: z.string().optional(),
    AUTH_ONELOGIN_CLIENT_SECRET: z.string().optional(),
    AUTH_ONELOGIN_ISSUER: z.string().optional(),
    AUTH_ONELOGIN_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_ONELOGIN_CHECKS: zAuthChecks,
    AUTH_ONELOGIN_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_AUTH0_CLIENT_ID: z.string().optional(),
    AUTH_AUTH0_CLIENT_SECRET: z.string().optional(),
    AUTH_AUTH0_ISSUER: z.string().url().optional(),
    AUTH_AUTH0_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_AUTH0_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_AUTH0_CHECKS: zAuthChecks,
    AUTH_COGNITO_CLIENT_ID: z.string().optional(),
    AUTH_COGNITO_CLIENT_SECRET: z.string().optional(),
    AUTH_COGNITO_ISSUER: z.string().url().optional(),
    AUTH_COGNITO_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_COGNITO_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_COGNITO_CHECKS: zAuthChecks,
    AUTH_KEYCLOAK_CLIENT_ID: z.string().optional(),
    AUTH_KEYCLOAK_CLIENT_SECRET: z.string().optional(),
    AUTH_KEYCLOAK_ISSUER: z.string().optional(),
    AUTH_KEYCLOAK_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_KEYCLOAK_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_KEYCLOAK_CHECKS: zAuthChecks,
    AUTH_KEYCLOAK_SCOPE: z.string().optional(),
    AUTH_KEYCLOAK_ID_TOKEN: z
      .enum(["true", "false"])
      .optional()
      .default("true"),
    AUTH_KEYCLOAK_NAME: z.string().optional(),
    AUTH_JUMPCLOUD_CLIENT_ID: z.string().optional(),
    AUTH_JUMPCLOUD_CLIENT_SECRET: z.string().optional(),
    AUTH_JUMPCLOUD_ISSUER: z.string().url().optional(),
    AUTH_JUMPCLOUD_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_JUMPCLOUD_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_JUMPCLOUD_CHECKS: zAuthChecks,
    AUTH_JUMPCLOUD_SCOPE: z.string().optional(),
    AUTH_CUSTOM_CLIENT_ID: z.string().optional(),
    AUTH_CUSTOM_CLIENT_SECRET: z.string().optional(),
    AUTH_CUSTOM_ISSUER: z.string().url().optional(),
    AUTH_CUSTOM_NAME: z.string().optional(),
    AUTH_CUSTOM_SCOPE: z.string().optional(),
    AUTH_CUSTOM_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_CUSTOM_CHECKS: zAuthChecks,
    AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_CUSTOM_ID_TOKEN: z.enum(["true", "false"]).optional().default("true"),
    AUTH_WORKOS_CLIENT_ID: z.string().optional(),
    AUTH_WORKOS_CLIENT_SECRET: z.string().optional(),
    AUTH_WORKOS_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_WORKOS_ORGANIZATION_ID: z.string().optional(),
    AUTH_WORKOS_CONNECTION_ID: z.string().optional(),
    AUTH_WORDPRESS_CLIENT_ID: z.string().optional(),
    AUTH_WORDPRESS_CLIENT_SECRET: z.string().optional(),
    AUTH_WORDPRESS_ALLOW_ACCOUNT_LINKING: z.enum(["true", "false"]).optional(),
    AUTH_WORDPRESS_CLIENT_AUTH_METHOD: zAuthMethod,
    AUTH_WORDPRESS_CHECKS: zAuthChecks,
    AUTH_DOMAINS_WITH_SSO_ENFORCEMENT: z.string().optional(),
    AUTH_IGNORE_ACCOUNT_FIELDS: z.string().optional(),
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
    AUTH_HTTP_PROXY: z.string().url().optional(),
    AUTH_HTTPS_PROXY: z.string().url().optional(),
    AUTH_SSO_TIMEOUT: z.number().optional(),
    // EMAIL
    EMAIL_FROM_ADDRESS: z.string().optional(),
    SMTP_CONNECTION_URL: z.string().optional(),

    // Otel
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default("http://localhost:4318"),
    OTEL_SERVICE_NAME: z.string().default("web"),
    OTEL_TRACE_SAMPLING_RATIO: z.coerce.number().gt(0).lte(1).default(1),

    // OTel Masking
    LANGFUSE_INGESTION_MASKING_PROPAGATED_HEADERS: z
      .string()
      .optional()
      .transform((s) =>
        s ? s.split(",").map((h) => h.toLowerCase().trim()) : [],
      ),

    // clickhouse
    CLICKHOUSE_URL: z.string().url(),
    CLICKHOUSE_CLUSTER_NAME: z.string().default("default"),
    CLICKHOUSE_DB: z.string().default("default"),
    CLICKHOUSE_USER: z.string(),
    CLICKHOUSE_PASSWORD: z.string(),
    CLICKHOUSE_CLUSTER_ENABLED: z.enum(["true", "false"]).default("true"),
    CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY: z.coerce
      .number()
      .default(32_000_000_000), // ~32GB

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

    // langfuse caching
    LANGFUSE_CACHE_API_KEY_ENABLED: z.enum(["true", "false"]).default("true"),
    LANGFUSE_CACHE_API_KEY_TTL_SECONDS: z.coerce.number().default(300),

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
    LANGFUSE_S3_MEDIA_UPLOAD_SSE: z.enum(["AES256", "aws:kms"]).optional(),
    LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID: z.string().optional(),

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

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SIGNING_SECRET: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_CSP_REPORT_URI: z.string().optional(),
    LANGFUSE_RATE_LIMITS_ENABLED: z.enum(["true", "false"]).default("true"),

    LANGFUSE_INIT_ORG_ID: z.string().optional(),
    LANGFUSE_INIT_ORG_NAME: z.string().optional(),
    LANGFUSE_INIT_ORG_CLOUD_PLAN: z.string().optional(), // for use in CI
    LANGFUSE_INIT_PROJECT_ID: z.string().optional(),
    LANGFUSE_INIT_PROJECT_NAME: z.string().optional(),
    LANGFUSE_INIT_PROJECT_RETENTION: z.coerce.number().int().gte(3).optional(),
    LANGFUSE_INIT_PROJECT_PUBLIC_KEY: z.string().optional(),
    LANGFUSE_INIT_PROJECT_SECRET_KEY: z.string().optional(),
    LANGFUSE_INIT_USER_EMAIL: z
      .union([z.string().email(), z.string().length(0)])
      .optional(),
    LANGFUSE_INIT_USER_NAME: z.string().optional(),
    LANGFUSE_INIT_USER_PASSWORD: z.string().optional(),
    LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT: z.coerce
      .number()
      .positive()
      .default(50_000),
    PLAIN_AUTHENTICATION_SECRET: z.string().optional(),
    PLAIN_API_KEY: z.string().optional(),
    PLAIN_CARDS_API_TOKEN: z.string().optional(),

    // UI customization - comma-separated list of visible product modules
    LANGFUSE_UI_VISIBLE_PRODUCT_MODULES: z.string().optional(),
    // UI customization - comma-separated list of hidden product modules
    LANGFUSE_UI_HIDDEN_PRODUCT_MODULES: z.string().optional(),

    SLACK_CLIENT_ID: z.string().optional(),
    SLACK_CLIENT_SECRET: z.string().optional(),
    SLACK_STATE_SECRET: z.string().optional(),

    // AWS Bedrock for langfuse native AI feature such as natural language filters
    LANGFUSE_AWS_BEDROCK_MODEL: z.string().optional(),

    // Tracing for Langfuse AI Features
    LANGFUSE_AI_FEATURES_HOST: z.string().optional(),

    // Natural Langfuse Filters
    LANGFUSE_AI_FEATURES_PUBLIC_KEY: z.string().optional(),
    LANGFUSE_AI_FEATURES_SECRET_KEY: z.string().optional(),
    LANGFUSE_AI_FEATURES_PROJECT_ID: z.string().optional(),

    // API Performance Flags
    // Enable Redis-based tracking of projects using OTEL API to optimize ClickHouse queries.
    // When enabled, projects ingesting via OTEL API skip the FINAL modifier on some observations queries for better performance.
    LANGFUSE_SKIP_FINAL_FOR_OTEL_PROJECTS: z
      .enum(["true", "false"])
      .default("false"),
    // Whether to propagate the toTimestamp restriction (including a server-side offset)
    // onto the observations CTE in GET /api/public/traces. Can be used to improve performance
    // for self-hosters that have a trace known trace duration of less than multiple hours.
    LANGFUSE_API_CLICKHOUSE_PROPAGATE_OBSERVATIONS_TIME_BOUNDS: z
      .enum(["true", "false"])
      .default("false"),

    // Events table migration
    LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS: z
      .enum(["true", "false"])
      .default("false"),

    LANGFUSE_ENABLE_EVENTS_TABLE_FLAGS: z
      .enum(["true", "false"])
      .default("false"),

    // v2 APIs (events table based) - disabled by default for self-hosters
    LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS: z
      .enum(["true", "false"])
      .default("false"),

    LANGFUSE_ENABLE_QUERY_OPTIMIZATION_SHADOW_TEST: z
      .enum(["true", "false"])
      .default("false"),

    // Blocked users for chat completion API (userId:reason format)
    LANGFUSE_BLOCKED_USERIDS_CHATCOMPLETION: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return new Map();
        const map = new Map();
        for (const part of val.split(",")) {
          const [userId, ...noteParts] = part.split(":");
          if (userId?.trim()) {
            map.set(userId.trim(), noteParts.join(":").trim() || "blocked");
          }
        }
        return map;
      }),
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
      .enum(["US", "EU", "STAGING", "DEV", "HIPAA"])
      .optional(),
    NEXT_PUBLIC_DEMO_PROJECT_ID: z.string().optional(),
    NEXT_PUBLIC_DEMO_ORG_ID: z.string().optional(),
    NEXT_PUBLIC_SIGN_UP_DISABLED: z.enum(["true", "false"]).default("false"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
    NEXT_PUBLIC_PLAIN_APP_ID: z.string().optional(),
    NEXT_PUBLIC_BUILD_ID: z.string().optional(),
    NEXT_PUBLIC_BASE_PATH: z.string().optional(),
    NEXT_PUBLIC_LANGFUSE_PLAYGROUND_STREAMING_ENABLED_DEFAULT: z
      .enum(["true", "false"])
      .optional()
      .default("true"),
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
    BUILD_ID: process.env.BUILD_ID,
    NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID,
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
    AUTH_GOOGLE_CLIENT_AUTH_METHOD: process.env.AUTH_GOOGLE_CLIENT_AUTH_METHOD,
    AUTH_GOOGLE_CHECKS: process.env.AUTH_GOOGLE_CHECKS,
    AUTH_GITHUB_CLIENT_ID: process.env.AUTH_GITHUB_CLIENT_ID,
    AUTH_GITHUB_CLIENT_SECRET: process.env.AUTH_GITHUB_CLIENT_SECRET,
    AUTH_GITHUB_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_GITHUB_ALLOW_ACCOUNT_LINKING,
    AUTH_GITHUB_CLIENT_AUTH_METHOD: process.env.AUTH_GITHUB_CLIENT_AUTH_METHOD,
    AUTH_GITHUB_CHECKS: process.env.AUTH_GITHUB_CHECKS,
    AUTH_GITHUB_ENTERPRISE_CLIENT_ID:
      process.env.AUTH_GITHUB_ENTERPRISE_CLIENT_ID,
    AUTH_GITHUB_ENTERPRISE_CLIENT_SECRET:
      process.env.AUTH_GITHUB_ENTERPRISE_CLIENT_SECRET,
    AUTH_GITHUB_ENTERPRISE_BASE_URL:
      process.env.AUTH_GITHUB_ENTERPRISE_BASE_URL,
    AUTH_GITHUB_ENTERPRISE_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_GITHUB_ENTERPRISE_ALLOW_ACCOUNT_LINKING,
    AUTH_GITHUB_ENTERPRISE_CLIENT_AUTH_METHOD:
      process.env.AUTH_GITHUB_ENTERPRISE_CLIENT_AUTH_METHOD,
    AUTH_GITHUB_ENTERPRISE_CHECKS: process.env.AUTH_GITHUB_ENTERPRISE_CHECKS,
    AUTH_GITLAB_ISSUER: process.env.AUTH_GITLAB_ISSUER,
    AUTH_GITLAB_CLIENT_ID: process.env.AUTH_GITLAB_CLIENT_ID,
    AUTH_GITLAB_CLIENT_SECRET: process.env.AUTH_GITLAB_CLIENT_SECRET,
    AUTH_GITLAB_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_GITLAB_ALLOW_ACCOUNT_LINKING,
    AUTH_GITLAB_CLIENT_AUTH_METHOD: process.env.AUTH_GITLAB_CLIENT_AUTH_METHOD,
    AUTH_GITLAB_CHECKS: process.env.AUTH_GITLAB_CHECKS,
    AUTH_GITLAB_URL: process.env.AUTH_GITLAB_URL,
    AUTH_AZURE_AD_CLIENT_ID: process.env.AUTH_AZURE_AD_CLIENT_ID,
    AUTH_AZURE_AD_CLIENT_SECRET: process.env.AUTH_AZURE_AD_CLIENT_SECRET,
    AUTH_AZURE_AD_TENANT_ID: process.env.AUTH_AZURE_AD_TENANT_ID,
    AUTH_AZURE_AD_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_AZURE_AD_ALLOW_ACCOUNT_LINKING ??
      process.env.AUTH_AZURE_ALLOW_ACCOUNT_LINKING, // fallback on old env var
    AUTH_AZURE_AD_CLIENT_AUTH_METHOD:
      process.env.AUTH_AZURE_AD_CLIENT_AUTH_METHOD ??
      process.env.AUTH_AZURE_CLIENT_AUTH_METHOD, // fallback on old env var
    AUTH_AZURE_AD_CHECKS:
      process.env.AUTH_AZURE_AD_CHECKS ?? process.env.AUTH_AZURE_CHECKS, // fallback on old env var
    AUTH_OKTA_CLIENT_ID: process.env.AUTH_OKTA_CLIENT_ID,
    AUTH_OKTA_CLIENT_SECRET: process.env.AUTH_OKTA_CLIENT_SECRET,
    AUTH_OKTA_ISSUER: process.env.AUTH_OKTA_ISSUER,
    AUTH_OKTA_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_OKTA_ALLOW_ACCOUNT_LINKING,
    AUTH_OKTA_CLIENT_AUTH_METHOD: process.env.AUTH_OKTA_CLIENT_AUTH_METHOD,
    AUTH_OKTA_CHECKS: process.env.AUTH_OKTA_CHECKS,
    AUTH_AUTHENTIK_CLIENT_ID: process.env.AUTH_AUTHENTIK_CLIENT_ID,
    AUTH_AUTHENTIK_CLIENT_SECRET: process.env.AUTH_AUTHENTIK_CLIENT_SECRET,
    AUTH_AUTHENTIK_ISSUER: process.env.AUTH_AUTHENTIK_ISSUER,
    AUTH_AUTHENTIK_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_AUTHENTIK_ALLOW_ACCOUNT_LINKING,
    AUTH_AUTHENTIK_CLIENT_AUTH_METHOD:
      process.env.AUTH_AUTHENTIK_CLIENT_AUTH_METHOD,
    AUTH_AUTHENTIK_CHECKS: process.env.AUTH_AUTHENTIK_CHECKS,
    AUTH_ONELOGIN_CLIENT_ID: process.env.AUTH_ONELOGIN_CLIENT_ID,
    AUTH_ONELOGIN_CLIENT_SECRET: process.env.AUTH_ONELOGIN_CLIENT_SECRET,
    AUTH_ONELOGIN_ISSUER: process.env.AUTH_ONELOGIN_ISSUER,
    AUTH_ONELOGIN_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_ONELOGIN_ALLOW_ACCOUNT_LINKING,
    AUTH_ONELOGIN_CLIENT_AUTH_METHOD:
      process.env.AUTH_ONELOGIN_CLIENT_AUTH_METHOD,
    AUTH_ONELOGIN_CHECKS: process.env.AUTH_ONELOGIN_CHECKS,
    AUTH_AUTH0_CLIENT_ID: process.env.AUTH_AUTH0_CLIENT_ID,
    AUTH_AUTH0_CLIENT_SECRET: process.env.AUTH_AUTH0_CLIENT_SECRET,
    AUTH_AUTH0_ISSUER: process.env.AUTH_AUTH0_ISSUER,
    AUTH_AUTH0_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_AUTH0_ALLOW_ACCOUNT_LINKING,
    AUTH_AUTH0_CLIENT_AUTH_METHOD: process.env.AUTH_AUTH0_CLIENT_AUTH_METHOD,
    AUTH_AUTH0_CHECKS: process.env.AUTH_AUTH0_CHECKS,
    AUTH_COGNITO_CLIENT_ID: process.env.AUTH_COGNITO_CLIENT_ID,
    AUTH_COGNITO_CLIENT_SECRET: process.env.AUTH_COGNITO_CLIENT_SECRET,
    AUTH_COGNITO_ISSUER: process.env.AUTH_COGNITO_ISSUER,
    AUTH_COGNITO_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_COGNITO_ALLOW_ACCOUNT_LINKING,
    AUTH_COGNITO_CLIENT_AUTH_METHOD:
      process.env.AUTH_COGNITO_CLIENT_AUTH_METHOD,
    AUTH_COGNITO_CHECKS: process.env.AUTH_COGNITO_CHECKS,
    AUTH_KEYCLOAK_CLIENT_ID: process.env.AUTH_KEYCLOAK_CLIENT_ID,
    AUTH_KEYCLOAK_CLIENT_SECRET: process.env.AUTH_KEYCLOAK_CLIENT_SECRET,
    AUTH_KEYCLOAK_ISSUER: process.env.AUTH_KEYCLOAK_ISSUER,
    AUTH_KEYCLOAK_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_KEYCLOAK_ALLOW_ACCOUNT_LINKING,
    AUTH_KEYCLOAK_CLIENT_AUTH_METHOD:
      process.env.AUTH_KEYCLOAK_CLIENT_AUTH_METHOD,
    AUTH_KEYCLOAK_CHECKS: process.env.AUTH_KEYCLOAK_CHECKS,
    AUTH_KEYCLOAK_SCOPE: process.env.AUTH_KEYCLOAK_SCOPE,
    AUTH_KEYCLOAK_ID_TOKEN: process.env.AUTH_KEYCLOAK_ID_TOKEN,
    AUTH_KEYCLOAK_NAME: process.env.AUTH_KEYCLOAK_NAME,
    AUTH_JUMPCLOUD_CLIENT_ID: process.env.AUTH_JUMPCLOUD_CLIENT_ID,
    AUTH_JUMPCLOUD_CLIENT_SECRET: process.env.AUTH_JUMPCLOUD_CLIENT_SECRET,
    AUTH_JUMPCLOUD_ISSUER: process.env.AUTH_JUMPCLOUD_ISSUER,
    AUTH_JUMPCLOUD_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_JUMPCLOUD_ALLOW_ACCOUNT_LINKING,
    AUTH_JUMPCLOUD_CLIENT_AUTH_METHOD:
      process.env.AUTH_JUMPCLOUD_CLIENT_AUTH_METHOD,
    AUTH_JUMPCLOUD_CHECKS: process.env.AUTH_JUMPCLOUD_CHECKS,
    AUTH_JUMPCLOUD_SCOPE: process.env.AUTH_JUMPCLOUD_SCOPE,
    AUTH_CUSTOM_CLIENT_ID: process.env.AUTH_CUSTOM_CLIENT_ID,
    AUTH_CUSTOM_CLIENT_SECRET: process.env.AUTH_CUSTOM_CLIENT_SECRET,
    AUTH_CUSTOM_ISSUER: process.env.AUTH_CUSTOM_ISSUER,
    AUTH_CUSTOM_NAME: process.env.AUTH_CUSTOM_NAME,
    AUTH_CUSTOM_SCOPE: process.env.AUTH_CUSTOM_SCOPE,
    AUTH_CUSTOM_CLIENT_AUTH_METHOD: process.env.AUTH_CUSTOM_CLIENT_AUTH_METHOD,
    AUTH_CUSTOM_CHECKS: process.env.AUTH_CUSTOM_CHECKS,
    AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING,
    AUTH_CUSTOM_ID_TOKEN: process.env.AUTH_CUSTOM_ID_TOKEN,
    AUTH_WORKOS_CLIENT_ID: process.env.AUTH_WORKOS_CLIENT_ID,
    AUTH_WORKOS_CLIENT_SECRET: process.env.AUTH_WORKOS_CLIENT_SECRET,
    AUTH_WORKOS_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_WORKOS_ALLOW_ACCOUNT_LINKING,
    AUTH_WORKOS_ORGANIZATION_ID: process.env.AUTH_WORKOS_ORGANIZATION_ID,
    AUTH_WORKOS_CONNECTION_ID: process.env.AUTH_WORKOS_CONNECTION_ID,
    AUTH_WORDPRESS_CLIENT_ID: process.env.AUTH_WORDPRESS_CLIENT_ID,
    AUTH_WORDPRESS_CLIENT_SECRET: process.env.AUTH_WORDPRESS_CLIENT_SECRET,
    AUTH_WORDPRESS_ALLOW_ACCOUNT_LINKING:
      process.env.AUTH_WORDPRESS_ALLOW_ACCOUNT_LINKING,
    AUTH_WORDPRESS_CLIENT_AUTH_METHOD:
      process.env.AUTH_WORDPRESS_CLIENT_AUTH_METHOD,
    AUTH_WORDPRESS_CHECKS: process.env.AUTH_WORDPRESS_CHECKS,
    AUTH_IGNORE_ACCOUNT_FIELDS: process.env.AUTH_IGNORE_ACCOUNT_FIELDS,
    AUTH_DOMAINS_WITH_SSO_ENFORCEMENT:
      process.env.AUTH_DOMAINS_WITH_SSO_ENFORCEMENT,
    AUTH_DISABLE_USERNAME_PASSWORD: process.env.AUTH_DISABLE_USERNAME_PASSWORD,
    AUTH_DISABLE_SIGNUP: process.env.AUTH_DISABLE_SIGNUP,
    AUTH_SESSION_MAX_AGE: process.env.AUTH_SESSION_MAX_AGE,
    AUTH_HTTP_PROXY: process.env.AUTH_HTTP_PROXY,
    AUTH_HTTPS_PROXY: process.env.AUTH_HTTPS_PROXY,
    AUTH_SSO_TIMEOUT: process.env.AUTH_SSO_TIMEOUT,
    // Email
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    SMTP_CONNECTION_URL: process.env.SMTP_CONNECTION_URL,
    // Otel
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
    OTEL_TRACE_SAMPLING_RATIO: process.env.OTEL_TRACE_SAMPLING_RATIO,

    LANGFUSE_INGESTION_MASKING_PROPAGATED_HEADERS:
      process.env.LANGFUSE_INGESTION_MASKING_PROPAGATED_HEADERS,

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
    LANGFUSE_S3_MEDIA_UPLOAD_SSE: process.env.LANGFUSE_S3_MEDIA_UPLOAD_SSE,
    LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID:
      process.env.LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID,
    // Worker
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    // Other
    NEXT_PUBLIC_PLAIN_APP_ID: process.env.NEXT_PUBLIC_PLAIN_APP_ID,
    PLAIN_AUTHENTICATION_SECRET: process.env.PLAIN_AUTHENTICATION_SECRET,
    PLAIN_API_KEY: process.env.PLAIN_API_KEY,
    PLAIN_CARDS_API_TOKEN: process.env.PLAIN_CARDS_API_TOKEN,
    // clickhouse
    CLICKHOUSE_URL: process.env.CLICKHOUSE_URL,
    CLICKHOUSE_CLUSTER_NAME: process.env.CLICKHOUSE_CLUSTER_NAME,
    CLICKHOUSE_DB: process.env.CLICKHOUSE_DB,
    CLICKHOUSE_USER: process.env.CLICKHOUSE_USER,
    CLICKHOUSE_PASSWORD: process.env.CLICKHOUSE_PASSWORD,
    CLICKHOUSE_CLUSTER_ENABLED: process.env.CLICKHOUSE_CLUSTER_ENABLED,
    CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY:
      process.env.CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY,
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
    LANGFUSE_UI_VISIBLE_PRODUCT_MODULES:
      process.env.LANGFUSE_UI_VISIBLE_PRODUCT_MODULES,
    LANGFUSE_UI_HIDDEN_PRODUCT_MODULES:
      process.env.LANGFUSE_UI_HIDDEN_PRODUCT_MODULES,
    // Playground
    NEXT_PUBLIC_LANGFUSE_PLAYGROUND_STREAMING_ENABLED_DEFAULT:
      process.env.NEXT_PUBLIC_LANGFUSE_PLAYGROUND_STREAMING_ENABLED_DEFAULT,
    // EE License
    LANGFUSE_EE_LICENSE_KEY: process.env.LANGFUSE_EE_LICENSE_KEY,
    ADMIN_API_KEY: process.env.ADMIN_API_KEY,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    // langfuse caching
    LANGFUSE_CACHE_API_KEY_ENABLED: process.env.LANGFUSE_CACHE_API_KEY_ENABLED,
    LANGFUSE_CACHE_API_KEY_TTL_SECONDS:
      process.env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS,
    LANGFUSE_ALLOWED_ORGANIZATION_CREATORS:
      process.env.LANGFUSE_ALLOWED_ORGANIZATION_CREATORS,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SIGNING_SECRET: process.env.STRIPE_WEBHOOK_SIGNING_SECRET,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_CSP_REPORT_URI: process.env.SENTRY_CSP_REPORT_URI,
    LANGFUSE_RATE_LIMITS_ENABLED: process.env.LANGFUSE_RATE_LIMITS_ENABLED,
    // provisioning
    LANGFUSE_INIT_ORG_ID: process.env.LANGFUSE_INIT_ORG_ID,
    LANGFUSE_INIT_ORG_NAME: process.env.LANGFUSE_INIT_ORG_NAME,
    LANGFUSE_INIT_ORG_CLOUD_PLAN: process.env.LANGFUSE_INIT_ORG_CLOUD_PLAN,
    LANGFUSE_INIT_PROJECT_ID: process.env.LANGFUSE_INIT_PROJECT_ID,
    LANGFUSE_INIT_PROJECT_NAME: process.env.LANGFUSE_INIT_PROJECT_NAME,
    LANGFUSE_INIT_PROJECT_RETENTION:
      process.env.LANGFUSE_INIT_PROJECT_RETENTION,
    LANGFUSE_INIT_PROJECT_PUBLIC_KEY:
      process.env.LANGFUSE_INIT_PROJECT_PUBLIC_KEY,
    LANGFUSE_INIT_PROJECT_SECRET_KEY:
      process.env.LANGFUSE_INIT_PROJECT_SECRET_KEY,
    LANGFUSE_INIT_USER_EMAIL: process.env.LANGFUSE_INIT_USER_EMAIL,
    LANGFUSE_INIT_USER_NAME: process.env.LANGFUSE_INIT_USER_NAME,
    LANGFUSE_INIT_USER_PASSWORD: process.env.LANGFUSE_INIT_USER_PASSWORD,
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH,
    LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT:
      process.env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT,
    SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
    SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
    SLACK_STATE_SECRET: process.env.SLACK_STATE_SECRET,

    // AWS Bedrock for langfuse native AI feature such as natural language filters
    LANGFUSE_AWS_BEDROCK_MODEL: process.env.LANGFUSE_AWS_BEDROCK_MODEL,

    // Langfuse Tracing AI Features
    LANGFUSE_AI_FEATURES_HOST: process.env.LANGFUSE_AI_FEATURES_HOST,

    // Api Performance Flags
    LANGFUSE_API_CLICKHOUSE_PROPAGATE_OBSERVATIONS_TIME_BOUNDS:
      process.env.LANGFUSE_API_CLICKHOUSE_PROPAGATE_OBSERVATIONS_TIME_BOUNDS,
    LANGFUSE_SKIP_FINAL_FOR_OTEL_PROJECTS:
      process.env.LANGFUSE_SKIP_FINAL_FOR_OTEL_PROJECTS,

    // Natural Language Filters
    LANGFUSE_AI_FEATURES_PUBLIC_KEY:
      process.env.LANGFUSE_AI_FEATURES_PUBLIC_KEY,
    LANGFUSE_AI_FEATURES_SECRET_KEY:
      process.env.LANGFUSE_AI_FEATURES_SECRET_KEY,
    LANGFUSE_AI_FEATURES_PROJECT_ID:
      process.env.LANGFUSE_AI_FEATURES_PROJECT_ID,
    // Events table migration
    LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS:
      process.env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS,
    LANGFUSE_ENABLE_EVENTS_TABLE_FLAGS:
      process.env.LANGFUSE_ENABLE_EVENTS_TABLE_FLAGS,
    LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS:
      process.env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS,
    LANGFUSE_ENABLE_QUERY_OPTIMIZATION_SHADOW_TEST:
      process.env.LANGFUSE_ENABLE_QUERY_OPTIMIZATION_SHADOW_TEST,
    LANGFUSE_BLOCKED_USERIDS_CHATCOMPLETION:
      process.env.LANGFUSE_BLOCKED_USERIDS_CHATCOMPLETION,
  },
  // Skip validation in Docker builds
  // DOCKER_BUILD is set in Dockerfile
  skipValidation: process.env.DOCKER_BUILD === "1",
  emptyStringAsUndefined: true, // https://env.t3.gg/docs/customization#treat-empty-strings-as-undefined
});
