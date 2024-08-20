import z from "zod";
import { plans } from "../entitlements/plans";

export const ApiKeyZod = z.object({
  id: z.string(),
  note: z.string().nullable(),
  publicKey: z.string(),
  hashedSecretKey: z.string(),
  fastHashedSecretKey: z.string().nullable(),
  displaySecretKey: z.string(),
  createdAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  projectId: z.string(),
  // orgId is added at write time to the redis cache.
  // It is required for rate limits to work efficiently.
  orgId: z.string(),
  plan: z.enum(plans),
});

export const API_KEY_NON_EXISTENT = "api-key-non-existent";

export const CachedApiKey = z.union([
  ApiKeyZod,
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
  apiKey: z.infer<typeof ApiKeyZod>;
};

export type ApiAccessScope = {
  projectId: string;
  accessLevel: "all" | "scores";
};
