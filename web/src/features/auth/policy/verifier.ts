import crypto from "node:crypto";

import { type ApiKey } from "@langfuse/shared/src/db";
import { UnauthorizedError } from "@langfuse/shared";
import { createShaHash } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { type ErrorResult, type Success } from "./types";
import { type ResolveContextParams } from "./resolveContext";

/** invalidCredentials is today's single 401 body for any unknown or malformed token. */
const invalidCredentials =
  "Invalid credentials. Confirm that you've configured the correct host.";

/** Verifier authenticates a request credential into a resolvable presentation, dispatching Basic vs Bearer and never throwing. */
export class Verifier {
  constructor(
    private readonly store: KeyStore,
    private readonly salt: string = env.SALT,
    private readonly adminApiKey: string | undefined = env.ADMIN_API_KEY,
    private readonly isCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION),
  ) {}

  /** verify resolves the Authorization header to a credential presentation, or a 401. */
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
    if (byFastHash?.fastHashedSecretKey) {
      return privateKey(byFastHash);
    }

    const slow = await this.store.findByPublicKey(publicKey);
    if (slow && (await this.store.verifySlow(secretKey, slow))) {
      await this.store.backfillFastHash(
        slow,
        createShaHash(secretKey, this.salt),
      );
      return privateKey(slow);
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
    if (byFastHash?.fastHashedSecretKey) {
      return privateKey(byFastHash);
    }

    const byPublicKey = await this.store.findByPublicKey(token);
    if (byPublicKey) {
      return { success: true, authorization: "publicKey", apiKey: byPublicKey };
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

/** VerifyResult is the credential the resolver consumes, or a 401; verify returns, never throws. */
export type VerifyResult =
  | (Success & ResolveContextParams)
  | ErrorResult<UnauthorizedError>;

/** KeyStore reads `ApiKey` rows by the two disjoint unique indexes and backfills the fast hash. */
export type KeyStore = {
  findByFastHash: (hash: string) => Promise<ApiKey | null>;
  findByPublicKey: (publicKey: string) => Promise<ApiKey | null>;
  verifySlow: (secretKey: string, apiKey: ApiKey) => Promise<boolean>;
  backfillFastHash: (apiKey: ApiKey, hash: string) => Promise<void>;
};
