import z from "zod";
import { Plan, plans } from "../../features/entitlements/plans";
import { CloudConfigRateLimit } from "../../interfaces/rate-limits";
import { ApiKeyScope, MakeOptional } from "../../";

const ApiKeyBaseSchema = z.object({
  id: z.string(),
  note: z.string().nullable(),
  publicKey: z.string(),
  displaySecretKey: z.string(),
  createdAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  fastHashedSecretKey: z.string(),
  hashedSecretKey: z.string(),
  orgId: z.string(),
  plan: z.enum(plans as unknown as [string, ...string[]]),
  rateLimitOverrides: CloudConfigRateLimit.nullish(),
  isIngestionSuspended: z.boolean().nullish(),
  isInAppAgentKey: z.boolean().default(false),
  // nullish for backward compatibility with cache entries written before
  // these columns existed
  createdByUserId: z.string().nullish(),
  createdByApiKeyId: z.string().nullish(),
  // Signup date of the owning organization, used by the Cloud OTel
  // direct-write cutoff (LFE-14536). Nullish so cache entries written before
  // this field existed stay parseable during a rolling deploy; consumers must
  // treat a missing value as "org age unknown" and fall back to the
  // pre-cutoff behaviour. Entries refresh within
  // LANGFUSE_CACHE_API_KEY_TTL_SECONDS.
  orgCreatedAt: z.iso.datetime().nullish(),
});

export const OrgEnrichedApiKey = z.discriminatedUnion("scope", [
  ApiKeyBaseSchema.extend({
    scope: z.literal(ApiKeyScope.ORGANIZATION),
    projectId: z.null(),
  }),
  ApiKeyBaseSchema.extend({
    scope: z.literal(ApiKeyScope.PROJECT),
    projectId: z.string(),
  }),
]);

export const API_KEY_NON_EXISTENT = "api-key-non-existent";

export const CachedApiKey = z.union([
  OrgEnrichedApiKey,
  z.literal(API_KEY_NON_EXISTENT),
]);

export type AuthHeaderVerificationResult =
  | AuthHeaderValidVerificationResult
  | {
      validKey: false;
      error: string;
    };

export type AuthHeaderValidVerificationResult = {
  validKey: true;
  scope: ApiAccessScope;
};

export type AuthHeaderValidVerificationResultIngestion = {
  validKey: true;
  scope: ApiAccessScopeIngestion;
};

export type ApiAccessLevel = "organization" | "project" | "scores";

type BaseApiAccessScope = {
  projectId: string | null;
  accessLevel: ApiAccessLevel;
};

type ApiAccessScopeMetadata = {
  orgId: string;
  // Nullish when resolved from an API-key cache entry predating the field.
  orgCreatedAt?: string | null;
  plan: Plan;
  rateLimitOverrides: z.infer<typeof CloudConfigRateLimit>;
  apiKeyId: string;
  publicKey: string;
  isIngestionSuspended: boolean | null | undefined;
  isInAppAgentKey?: boolean;
};

export type ApiAccessScopeIngestion = BaseApiAccessScope &
  MakeOptional<ApiAccessScopeMetadata>;

export type ApiAccessScope = BaseApiAccessScope & ApiAccessScopeMetadata;
