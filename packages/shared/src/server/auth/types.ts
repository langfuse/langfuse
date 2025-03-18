import z from "zod";
import { Plan, plans } from "../../features/entitlements/plans";
import { CloudConfigRateLimit } from "../../interfaces/rate-limits";

export const OrgEnrichedApiKey = z.object({
  id: z.string(),
  note: z.string().nullable(),
  publicKey: z.string(),
  displaySecretKey: z.string(),
  createdAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  projectId: z.string(),
  fastHashedSecretKey: z.string(),
  hashedSecretKey: z.string(),
  orgId: z.string(),
  plan: z.enum(plans as unknown as [string, ...string[]]),
  rateLimitOverrides: CloudConfigRateLimit.nullish(),
});

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

export type ApiAccessScope = {
  projectId: string;
  accessLevel: "all" | "scores";
  orgId: string;
  plan: Plan;
  rateLimitOverrides: z.infer<typeof CloudConfigRateLimit>;
  apiKeyId: string;
};
