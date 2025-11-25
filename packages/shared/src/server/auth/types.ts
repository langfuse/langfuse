import z from "zod/v4";
import { Plan, plans } from "../../features/entitlements/plans";
import { CloudConfigRateLimit } from "../../interfaces/rate-limits";
import { ApiKeyScope, MakeOptional } from "../../";

const ApiKeyBaseSchema = z.object({
  id: z.string(),
  note: z.string().nullable(),
  publicKey: z.string(),
  displaySecretKey: z.string(),
  createdAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  fastHashedSecretKey: z.string(),
  hashedSecretKey: z.string(),
  orgId: z.string(),
  plan: z.enum(plans as unknown as [string, ...string[]]),
  rateLimitOverrides: CloudConfigRateLimit.nullish(),
  isIngestionSuspended: z.boolean().nullish(),
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

type BaseApiAccessScope = {
  projectId: string | null;
  accessLevel: "organization" | "project" | "scores";
};

type ApiAccessScopeMetadata = {
  orgId: string;
  plan: Plan;
  rateLimitOverrides: z.infer<typeof CloudConfigRateLimit>;
  apiKeyId: string;
  publicKey: string;
  isIngestionSuspended: boolean | null | undefined;
};

export type ApiAccessScopeIngestion = BaseApiAccessScope &
  MakeOptional<ApiAccessScopeMetadata>;

export type ApiAccessScope = BaseApiAccessScope & ApiAccessScopeMetadata;
