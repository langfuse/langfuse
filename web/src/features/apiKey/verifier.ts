import crypto from "node:crypto";

import { type ApiKey } from "@langfuse/shared/src/db";
import { InternalServerError, UnauthorizedError } from "@langfuse/shared";
import { createShaHash, verifySecretKey } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { type Credential } from "@/src/features/apiKey/helpers/parseAuthorizationHeader";
import { ApiKeyRepository } from "@/src/features/apiKey/apiKeyRepository";
import {
  type ErrorResult,
  type Success,
} from "@/src/features/auth/policy/types";

/** invalidCredentials is today's single 401 body for any unknown or malformed token. */
export const invalidCredentials =
  "Invalid credentials. Confirm that you've configured the correct host.";

/** publicKeyPrefix is the prefix every Langfuse public key carries. */
const publicKeyPrefix = "pk-lf-";

/** Verifier authenticates a request credential into a resolvable presentation, dispatching Basic vs Bearer and never throwing. */
export class Verifier {
  constructor(
    private readonly apiKeyRepo: ApiKeyRepository = new ApiKeyRepository(),
    private readonly salt: string = env.SALT,
    private readonly adminApiKey: string | undefined = env.ADMIN_API_KEY,
  ) {}

  /** verify resolves a parsed credential to a presentation, or a typed failure. */
  async verify(credential: Credential): Promise<VerifyApiKeyResult> {
    if (credential.kind === "basic") {
      return this.verifyBasic(credential.publicKey, credential.secretKey);
    }
    if (credential.kind === "bearer") {
      return this.verifyBearer(credential.token);
    }
    return unauthorized();
  }

  /** verifyBasic authenticates a public:secret pair as the privateKey presentation, private key first then a slow bcrypt backfill. */
  private async verifyBasic(
    publicKey: string,
    secretKey: string,
  ): Promise<VerifyApiKeyResult> {
    const byPrivateKey = await this.verifyPrivateKey(secretKey);
    if (byPrivateKey) return byPrivateKey;

    const bySlowHash = await this.backfillSlowHash(publicKey, secretKey);
    if (bySlowHash) return bySlowHash;

    return unauthorized();
  }

  /** verifyBearer chains admin, then public (public key), then private (fast hash). */
  private async verifyBearer(token: string): Promise<VerifyApiKeyResult> {
    const admin = this.verifyAdminKey(token);
    if (admin) return admin;

    const byPublicKey = await this.verifyPublicKey(token);
    if (byPublicKey) return byPublicKey;

    const byPrivateKey = await this.verifyPrivateKey(token);
    if (byPrivateKey) return byPrivateKey;

    return unauthorized();
  }

  /** verifyPrivateKey resolves a secret to its privateKey presentation via the fast-hash index, or null when it is not indexed there. */
  private async verifyPrivateKey(
    secretKey: string,
  ): Promise<VerifyApiKeyResult | null> {
    const found = await this.apiKeyRepo.findByFastHash(
      createShaHash(secretKey, this.salt),
    );
    if (!found.success) return found;
    if (found.apiKey?.fastHashedSecretKey) return privateKey(found.apiKey);
    return null;
  }

  /** backfillSlowHash bcrypt-verifies a secret against the public key's row, backfilling the fast hash on a match, or null on a miss. */
  private async backfillSlowHash(
    publicKey: string,
    secretKey: string,
  ): Promise<VerifyApiKeyResult | null> {
    const found = await this.apiKeyRepo.findByPublicKey(publicKey);
    if (!found.success) return found;
    if (!found.apiKey) return null;

    let valid: boolean;
    try {
      valid = await verifySecretKey(secretKey, found.apiKey.hashedSecretKey);
    } catch (error) {
      return {
        success: false,
        error: new InternalServerError(`slow verify failed: ${String(error)}`),
      };
    }
    if (!valid) return null;

    await this.apiKeyRepo.backfillFastHash(
      found.apiKey.id,
      createShaHash(secretKey, this.salt),
    );
    return privateKey(found.apiKey);
  }

  /** verifyAdminKey resolves a token that timing-safe matches the admin key, or null; the key is ignored unless set and non-empty after trimming. */
  private verifyAdminKey(token: string): VerifyApiKeyResult | null {
    const adminApiKey = this.adminApiKey?.trim();
    if (!adminApiKey) return null;
    try {
      if (
        crypto.timingSafeEqual(Buffer.from(token), Buffer.from(adminApiKey))
      ) {
        return { success: true, authorization: "admin" };
      }
    } catch {
      return null;
    }
    return null;
  }

  /** verifyPublicKey resolves a public-key token to its scores-only presentation, or null when it is not a public key or is unknown. */
  private async verifyPublicKey(
    token: string,
  ): Promise<VerifyApiKeyResult | null> {
    if (!token.startsWith(publicKeyPrefix)) return null;
    const found = await this.apiKeyRepo.findByPublicKey(token);
    if (!found.success) return found;
    if (!found.apiKey) return null;
    // Public-key (bearer) auth is project-scoped score ingest only; an org key
    // must authenticate with its secret over basic or private bearer.
    if (found.apiKey.scope !== "PROJECT") return null;
    return { success: true, authorization: "publicKey", apiKey: found.apiKey };
  }
}

/** privateKey wraps an ApiKey row as the full-access privateKey presentation. */
function privateKey(apiKey: ApiKey): VerifyApiKeyResult {
  return { success: true, authorization: "privateKey", apiKey };
}

/** unauthorized is the single 401 outcome for any unknown or malformed credential. */
function unauthorized(): ErrorResult<UnauthorizedError> {
  return { success: false, error: new UnauthorizedError(invalidCredentials) };
}

/** VerifiedCredential is the presentation the resolver consumes: an api key with how it was presented, or the admin key. */
export type VerifiedCredential =
  | { authorization: "publicKey" | "privateKey"; apiKey: ApiKey }
  | { authorization: "admin" };

/** VerifyApiKeyResult is the verified credential, or a typed failure; verify returns, never throws. */
export type VerifyApiKeyResult =
  | (Success & VerifiedCredential)
  | ErrorResult<UnauthorizedError | InternalServerError>;
