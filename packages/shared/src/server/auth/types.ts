import z from "zod";
import { plans } from "../../features/entitlements/plans";
import { CloudConfigRateLimitZod } from "../../interfaces/rate-limits";

export const OrgEnrichedApiKey = z.object({
  id: z.string(),
  note: z.string().nullable(),
  publicKey: z.string(),
  displaySecretKey: z.string(),
  createdAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  projectId: z.string(),
  // orgId is added at write time to the redis cache.
  // Best way to rate-limit API keys on a per-org basis.
  orgId: z.string(),
  plan: z.enum(plans as unknown as [string, ...string[]]),
  rateLimits: CloudConfigRateLimitZod.nullish(),
});

export const OrgAndAPIKeyEnrichedApiKey = OrgEnrichedApiKey.extend({
  fastHashedSecretKey: z.string(),
  hashedSecretKey: z.string(),
});

export const API_KEY_NON_EXISTENT = "api-key-non-existent";

export const CachedApiKey = z.union([
  OrgAndAPIKeyEnrichedApiKey,
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
  apiKey?: z.infer<typeof OrgEnrichedApiKey>;
};

export type ApiAccessScope = {
  projectId: string;
  accessLevel: "all" | "scores";
};
