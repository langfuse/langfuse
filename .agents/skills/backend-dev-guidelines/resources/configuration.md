# Configuration Management - Environment Variables

Complete guide to managing configuration across Langfuse's monorepo packages.

## Table of Contents

- [Environment Variable Pattern](#environment-variable-pattern)
- [Package-Specific Configuration](#package-specific-configuration)
- [Special Environment Variables](#special-environment-variables)
- [Best Practices](#best-practices)

---

## Environment Variable Pattern

### Why Zod-Validated Environment Variables?

**Problems with raw process.env:**

- ❌ No type safety
- ❌ No validation
- ❌ Hard to test
- ❌ Runtime errors for typos
- ❌ No default values

**Benefits of Zod validation:**

- ✅ Type-safe configuration
- ✅ Validated at startup
- ✅ Clear error messages
- ✅ Default values
- ✅ Environment-specific transformation

---

## Package-Specific Configuration

Each package has its own `env.ts` or `env.mjs` file that validates and exports environment variables:

```
langfuse/
├── web/src/env.mjs              # Next.js app (t3-env pattern)
├── worker/src/env.ts            # Worker service (Zod schema)
├── packages/shared/src/env.ts   # Shared config (Zod schema)
└── ee/src/env.ts                # Enterprise Edition (Zod schema)
```

### Web Package (`web/src/env.mjs`)

Uses **t3-oss/env-nextjs** for Next.js-specific validation with server/client separation.

**Key Features:**

- Separates server-side and client-side environment variables
- Client variables must be prefixed with `NEXT_PUBLIC_`
- Validates at build time (unless `DOCKER_BUILD=1`)
- `runtimeEnv` section manually maps all variables

**Structure:**

```typescript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  // Server-side only variables (never exposed to client)
  server: {
    DATABASE_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(1),
    SALT: z.string(),
    CLICKHOUSE_URL: z.string().url(),
    // ... 100+ server variables
  },

  // Client-side variables (exposed to browser)
  client: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: z
      .enum(["US", "EU", "STAGING", "DEV", "HIPAA"])
      .optional(),
    NEXT_PUBLIC_SIGN_UP_DISABLED: z.enum(["true", "false"]).default("false"),
    // ... client variables
  },

  // Runtime mapping (required for Next.js edge runtime)
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION:
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    // ... must map ALL variables
  },

  // Skip validation in Docker builds
  skipValidation: process.env.DOCKER_BUILD === "1",
  emptyStringAsUndefined: true,
});
```

**Usage:**

```typescript
// In server-side code (tRPC, API routes)
import { env } from "@/src/env.mjs";

const dbUrl = env.DATABASE_URL;
const salt = env.SALT;

// In client-side code (React components)
import { env } from "@/src/env.mjs";

const region = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
```

### Worker Package (`worker/src/env.ts`)

Uses **plain Zod schema** for Express.js worker service.

**Structure:**

```typescript
import { z } from "zod/v4";
import { removeEmptyEnvVariables } from "@langfuse/shared";

const EnvSchema = z.object({
  BUILD_ID: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string(),
  PORT: z.coerce.number().positive().max(65536).default(3030),

  // ClickHouse
  CLICKHOUSE_URL: z.string().url(),
  CLICKHOUSE_USER: z.string(),
  CLICKHOUSE_PASSWORD: z.string(),

  // S3 Event Upload (required)
  LANGFUSE_S3_EVENT_UPLOAD_BUCKET: z.string({
    error: "Langfuse requires a bucket name for S3 Event Uploads.",
  }),

  // Queue concurrency settings
  LANGFUSE_INGESTION_QUEUE_PROCESSING_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(20),
  LANGFUSE_EVAL_EXECUTION_WORKER_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(5),

  // Queue consumer toggles
  QUEUE_CONSUMER_INGESTION_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_BATCH_EXPORT_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),

  // ... 150+ worker-specific variables
});

export const env: z.infer<typeof EnvSchema> =
  process.env.DOCKER_BUILD === "1"
    ? (process.env as any)
    : EnvSchema.parse(removeEmptyEnvVariables(process.env));
```

**Usage:**

```typescript
import { env } from "./env";

const concurrency = env.LANGFUSE_INGESTION_QUEUE_PROCESSING_CONCURRENCY;
const s3Bucket = env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET;
```

### Shared Package (`packages/shared/src/env.ts`)

Uses **plain Zod schema** for configuration shared between web and worker.

**Structure:**

```typescript
import { z } from "zod/v4";
import { removeEmptyEnvVariables } from "./utils/environment";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Redis configuration
  REDIS_HOST: z.string().nullish(),
  REDIS_PORT: z.coerce.number().positive().max(65536).default(6379).nullable(),
  REDIS_AUTH: z.string().nullish(),
  REDIS_CONNECTION_STRING: z.string().nullish(),
  REDIS_CLUSTER_ENABLED: z.enum(["true", "false"]).default("false"),

  // ClickHouse
  CLICKHOUSE_URL: z.string().url(),
  CLICKHOUSE_USER: z.string(),
  CLICKHOUSE_PASSWORD: z.string(),
  CLICKHOUSE_MAX_OPEN_CONNECTIONS: z.coerce.number().int().default(25),

  // S3 Event Upload
  LANGFUSE_S3_EVENT_UPLOAD_BUCKET: z.string(),
  LANGFUSE_S3_EVENT_UPLOAD_REGION: z.string().optional(),

  // Logging
  LANGFUSE_LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .optional(),
  LANGFUSE_LOG_FORMAT: z.enum(["text", "json"]).default("text"),

  // Encryption
  ENCRYPTION_KEY: z
    .string()
    .length(
      64,
      "ENCRYPTION_KEY must be 256 bits, 64 string characters in hex format, generate via: openssl rand -hex 32",
    )
    .optional(),

  // ... 80+ shared variables
});

export const env: z.infer<typeof EnvSchema> =
  process.env.DOCKER_BUILD === "1"
    ? (process.env as any)
    : EnvSchema.parse(removeEmptyEnvVariables(process.env));
```

**Usage:**

```typescript
import { env } from "@langfuse/shared/src/env";

const redisHost = env.REDIS_HOST;
const clickhouseUrl = env.CLICKHOUSE_URL;
```

### Enterprise Edition Package (`ee/src/env.ts`)

Minimal Zod schema for EE-specific variables.

**Structure:**

```typescript
import { z } from "zod/v4";
import { removeEmptyEnvVariables } from "@langfuse/shared";

const EnvSchema = z.object({
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: z.string().optional(),
  LANGFUSE_EE_LICENSE_KEY: z.string().optional(),
});

export const env = EnvSchema.parse(removeEmptyEnvVariables(process.env));
```

**Usage:**

```typescript
import { env } from "@langfuse/ee/src/env";

const licenseKey = env.LANGFUSE_EE_LICENSE_KEY;
```

---

## Special Environment Variables

### NEXT_PUBLIC_LANGFUSE_CLOUD_REGION

**Purpose:** Identifies the cloud deployment region for Langfuse Cloud.

**Type:** `"US" | "EU" | "STAGING" | "DEV" | "HIPAA" | undefined`

**Where Used:**

- **web/src/env.mjs** - Client-side accessible (prefixed with `NEXT_PUBLIC_`)
- **ee/src/env.ts** - Enterprise features
- **packages/shared/src/env.ts** - Shared logic
- **worker/src/env.ts** - Worker processing

**When Set:**

| Environment              | Value                  | Purpose                                        |
| ------------------------ | ---------------------- | ---------------------------------------------- |
| **Developer Laptop**     | `"DEV"` or `"STAGING"` | Local development against cloud infrastructure |
| **Langfuse Cloud US**    | `"US"`                 | Production US region                           |
| **Langfuse Cloud EU**    | `"EU"`                 | Production EU region                           |
| **Langfuse Cloud HIPAA** | `"HIPAA"`              | HIPAA-compliant region                         |
| **OSS Self-Hosted**      | `undefined` (not set)  | Self-hosted deployments don't have region      |

**Use Cases:**

```typescript
// Check if running in cloud
if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  // Enable cloud-specific features
  - Usage metering and billing
  - Cloud spend alerts
  - Free tier enforcement
  - Stripe integration
  - PostHog analytics
}

// Region-specific behavior
if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "HIPAA") {
  // HIPAA compliance features
}

// Development/staging checks
if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV") {
  // Enable debug features
}
```

**Example Configuration:**

```bash
# .env file on developer laptop
NEXT_PUBLIC_LANGFUSE_CLOUD_REGION=DEV

# Cloud US deployment
NEXT_PUBLIC_LANGFUSE_CLOUD_REGION=US

# Self-hosted OSS deployment
# (variable not set)
```

### LANGFUSE_EE_LICENSE_KEY

**Purpose:** Enables Enterprise Edition features in self-hosted deployments.

**Type:** `string | undefined`

**Where Used:**

- **web/src/env.mjs** - Web app EE features
- **ee/src/env.ts** - EE package

**When Set:**

| Deployment          | Value              | Features Enabled                                                 |
| ------------------- | ------------------ | ---------------------------------------------------------------- |
| **Langfuse Cloud**  | Not set            | Cloud features controlled by `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` |
| **OSS Self-Hosted** | Not set            | Core open-source features only                                   |
| **EE Self-Hosted**  | License key string | Enterprise features enabled                                      |

**Enterprise Features Controlled:**

When `LANGFUSE_EE_LICENSE_KEY` is set and valid:

- SSO integrations (custom OIDC, SAML)
- Advanced RBAC
- Audit logging
- Custom branding
- SLA support
- Advanced security features

**Usage Pattern:**

```typescript
import { env } from "@/src/env.mjs";

// Check if EE license is present
if (env.LANGFUSE_EE_LICENSE_KEY) {
  // Validate license
  const isValidLicense = await validateEELicense(env.LANGFUSE_EE_LICENSE_KEY);

  if (isValidLicense) {
    // Enable EE features
    enableCustomSSO();
    enableAdvancedRBAC();
  }
}
```

**Example Configuration:**

```bash
# OSS self-hosted (no license)
# LANGFUSE_EE_LICENSE_KEY not set

# EE self-hosted
LANGFUSE_EE_LICENSE_KEY=ee_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Langfuse Cloud (uses region instead)
NEXT_PUBLIC_LANGFUSE_CLOUD_REGION=US
# LANGFUSE_EE_LICENSE_KEY not used
```

### Other Important Variables

**DOCKER_BUILD**

```typescript
// Skip validation during Docker builds
skipValidation: process.env.DOCKER_BUILD === "1";
```

**Purpose:** Docker builds happen before runtime env vars are available, so validation must be skipped.

**SALT**

```typescript
SALT: z.string({
  required_error: "A strong Salt is required to encrypt API keys securely.",
});
```

**Purpose:** Required for encrypting API keys in database. Must be set in production.

**ENCRYPTION_KEY**

```typescript
ENCRYPTION_KEY: z.string().length(64, "Must be 256 bits, 64 hex characters");
```

**Purpose:** Optional 256-bit key for encrypting sensitive database fields.

**Generate:** `openssl rand -hex 32`

---

## Best Practices

### 1. Always Import from env.mjs/env.ts

```typescript
// ❌ NEVER DO THIS
const dbUrl = process.env.DATABASE_URL;

// ✅ ALWAYS DO THIS
import { env } from "@/src/env.mjs";
const dbUrl = env.DATABASE_URL; // Type-safe, validated
```

### 2. Use Appropriate Import Path

```typescript
// In web package
import { env } from "@/src/env.mjs";

// In worker package
import { env } from "./env";

// In shared package
import { env } from "@langfuse/shared/src/env";
```

### 3. Client Variables Must Start with NEXT*PUBLIC*

```typescript
// ❌ Won't work in browser
API_KEY: z.string(); // in server config

// ✅ Accessible in browser
NEXT_PUBLIC_API_KEY: z.string(); // in client config
```

### 4. Provide Sensible Defaults for Development

```typescript
PORT: z.coerce.number().positive().default(3030),
NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
REDIS_PORT: z.coerce.number().positive().default(6379),
```

### 5. Use Coercion for Numbers

```typescript
// .env files are always strings
PORT: z.coerce.number(); // Converts "3000" to 3000
```

### 6. Transform Complex Values

```typescript
// Split comma-separated values
LANGFUSE_LOG_PROPAGATED_HEADERS: z.string().optional().transform((s) =>
  s ? s.split(",").map((s) => s.toLowerCase().trim()) : []
),

// Parse project:rate pairs
LANGFUSE_INGESTION_PROCESSING_SAMPLED_PROJECTS: z.string().optional().transform((val) => {
  const map = new Map<string, number>();
  val?.split(",").forEach(part => {
    const [projectId, rate] = part.split(":");
    map.set(projectId, parseFloat(rate));
  });
  return map;
}),
```

### 7. Validation at Startup

All environment variables are validated when the application starts. Invalid configuration will cause immediate failure with clear error messages:

```bash
❌ Validation error:
  - SALT: Required
  - CLICKHOUSE_URL: Invalid url
  - PORT: Number must be less than or equal to 65536
```

### 8. Skip Validation in Docker Builds

Always include the Docker build escape hatch:

```typescript
export const env =
  process.env.DOCKER_BUILD === "1"
    ? (process.env as any)
    : EnvSchema.parse(removeEmptyEnvVariables(process.env));
```

### 9. Use removeEmptyEnvVariables Helper

Treats empty strings as undefined:

```typescript
import { removeEmptyEnvVariables } from "@langfuse/shared";

EnvSchema.parse(removeEmptyEnvVariables(process.env));
```

This prevents errors from `.env` files with empty values:

```bash
# .env
OPTIONAL_VAR=    # Treated as undefined, not empty string
```

---

## Configuration File Locations

```
langfuse/
├── .env                          # Local development overrides
├── .env.dev.example              # Example dev configuration
├── web/src/env.mjs               # Web app env validation
├── worker/src/env.ts             # Worker env validation
├── packages/shared/src/env.ts    # Shared env validation
└── ee/src/env.ts                 # EE env validation
```

**DO NOT commit:**

- `.env`
- `.env.local`
- `.env.production`

---

**Related Files:**

- [SKILL.md](../SKILL.md) - Main guide
- [architecture-overview.md](architecture-overview.md) - Architecture patterns
