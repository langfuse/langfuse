import crypto from "node:crypto";

import { type ApiKey } from "@langfuse/shared/src/db";
import { type InternalServerError, UnauthorizedError } from "@langfuse/shared";
import { createShaHash } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { type ErrorResult, type Success } from "./types";

/** invalidCredentials is today's single 401 body for any unknown or malformed token. */
const invalidCredentials =
  "Invalid credentials. Confirm that you've configured the correct host.";

/** Verifier authenticates a request credential into a resolvable presentation, dispatching Basic vs Bearer and never throwing. */
export class Verifier {
  constructor(
    private readonly store: ApiKeyRepository,
    private readonly salt: string = env.SALT,
    private readonly adminApiKey: string | undefined = env.ADMIN_API_KEY,
    private readonly isCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION),
  ) {}

  /** verify resolves the Authorization header to a credential presentation, or a typed failure. */
  async verify(authHeader: string | undefined): Promise<VerifyResult> {
    if (authHeader?.startsWith("Basic ")) {
      return this.verifyBasic(authHeader.slice("Basic ".length));
    }
    if (authHeader?.startsWith("Bearer ")) {
      return this.verifyBearer(authHeader.slice("Bearer ".length));
    }
    return unauthorized();
  }

  /** verifyBasic authenticates a public:secret pair as the privateKey presentation. */
  private async verifyBasic(encoded: string): Promise<VerifyResult> {
    const credentials = decodeBasic(encoded);
    if (!credentials) return unauthorized();
    const { publicKey, secretKey } = credentials;

    const byFastHash = await this.store.findByFastHash(
      createShaHash(secretKey, this.salt),
    );
    if (!byFastHash.success) return byFastHash;
    if (byFastHash.apiKey?.fastHashedSecretKey) {
      return privateKey(byFastHash.apiKey);
    }

    const slow = await this.store.findByPublicKey(publicKey);
    if (!slow.success) return slow;
    if (slow.apiKey) {
      const verified = await this.store.verifySlow(secretKey, slow.apiKey);
      if (!verified.success) return verified;
      if (verified.valid) {
        await this.store.backfillFastHash(
          slow.apiKey,
          createShaHash(secretKey, this.salt),
        );
        return privateKey(slow.apiKey);
      }
    }
    return unauthorized();
  }

  /** verifyBearer chains admin, then private (fast hash), then public (public key). */
  private async verifyBearer(token: string): Promise<VerifyResult> {
    if (this.matchesAdminKey(token)) {
      return { success: true, authorization: "adminKey" };
    }

    const byFastHash = await this.store.findByFastHash(
      createShaHash(token, this.salt),
    );
    if (!byFastHash.success) return byFastHash;
    if (byFastHash.apiKey?.fastHashedSecretKey) {
      return privateKey(byFastHash.apiKey);
    }

    const byPublicKey = await this.store.findByPublicKey(token);
    if (!byPublicKey.success) return byPublicKey;
    if (byPublicKey.apiKey) {
      return {
        success: true,
        authorization: "publicKey",
        apiKey: byPublicKey.apiKey,
      };
    }
    return unauthorized();
  }

  /** matchesAdminKey timing-safe compares the token to the self-host admin key. */
  private matchesAdminKey(token: string): boolean {
    if (this.isCloud || !this.adminApiKey) return false;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(token),
        Buffer.from(this.adminApiKey),
      );
    } catch {
      return false;
    }
  }
}

/** privateKey wraps an ApiKey row as the full-access privateKey presentation. */
function privateKey(apiKey: ApiKey): VerifyResult {
  return { success: true, authorization: "privateKey", apiKey };
}

/** unauthorized is the single 401 outcome for any unknown or malformed credential. */
function unauthorized(): ErrorResult<UnauthorizedError> {
  return { success: false, error: new UnauthorizedError(invalidCredentials) };
}

/** decodeBasic decodes a base64 `public:secret` payload, or undefined if malformed. */
function decodeBasic(
  encoded: string,
): { publicKey: string; secretKey: string } | undefined {
  const [publicKey, secretKey] = atob(encoded).split(":");
  if (!publicKey || !secretKey) return undefined;
  return { publicKey, secretKey };
}

/** VerifiedCredential is the presentation the resolver consumes: an api key with how it was presented, or the admin key. */
export type VerifiedCredential =
  | { authorization: "publicKey" | "privateKey"; apiKey: ApiKey }
  | { authorization: "adminKey" };

/** VerifyResult is the verified credential, or a typed failure; verify returns, never throws. */
export type VerifyResult =
  | (Success & VerifiedCredential)
  | ErrorResult<UnauthorizedError | InternalServerError>;

/** ApiKeyLookup is a hit, a miss (null), or an infra failure; a miss is normal control flow, not an error. */
export type ApiKeyLookup =
  | (Success & { apiKey: ApiKey | null })
  | ErrorResult<InternalServerError>;

/** VerifySlowResult is the bcrypt comparison outcome, or an infra failure. */
export type VerifySlowResult =
  | (Success & { valid: boolean })
  | ErrorResult<InternalServerError>;

/** ApiKeyRepository reads `ApiKey` rows by the two disjoint unique indexes and backfills the fast hash. */
export type ApiKeyRepository = {
  findByFastHash: (hash: string) => Promise<ApiKeyLookup>;
  findByPublicKey: (publicKey: string) => Promise<ApiKeyLookup>;
  verifySlow: (secretKey: string, apiKey: ApiKey) => Promise<VerifySlowResult>;
  backfillFastHash: (apiKey: ApiKey, hash: string) => Promise<void>;
};
