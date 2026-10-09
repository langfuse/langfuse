import { type ApiKey } from "@langfuse/shared/src/db";
import {
  type InternalServerError,
  type ServiceUnavailableError,
  type UnauthorizedError,
} from "@langfuse/shared";
import { createShaHash, verifySecretKey } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { type Credential } from "@/src/features/apiKey/helpers/parseAuthorizationHeader";
import { ApiKeyRepository } from "@/src/features/apiKey/apiKeyRepository";
import { isApiKeyExpired } from "@/src/features/apiKey/helpers/isApiKeyExpired";
import { matchesAdminApiKey } from "@/src/features/apiKey/helpers/matchesAdminApiKey";
import {
  internalServerError,
  unauthorizedError,
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

  /** verify resolves a parsed credential to a presentation, or a typed failure; an expired key 401s like an unknown one. */
  async verify(credential: Credential): Promise<VerifyApiKeyResult> {
    if (credential.kind === "basic") {
      return this.verifyBasic(credential.publicKey, credential.secretKey);
    }
    if (credential.kind === "bearer") {
      return this.verifyBearer(credential.token);
    }
    return unauthorizedError(invalidCredentials);
  }

  /** verifyBasic authenticates a public:secret pair as the privateKey presentation, private key first then a slow bcrypt backfill. */
  private async verifyBasic(
    publicKey: string,
    secretKey: string,
  ): Promise<VerifyApiKeyResult> {
    const byPrivateKey = await this.verifyPrivateKey(secretKey);
    if (byPrivateKey) return rejectExpired(byPrivateKey);

    const bySlowHash = await this.backfillSlowHash(publicKey, secretKey);
    if (bySlowHash) return rejectExpired(bySlowHash);

    return unauthorizedError(invalidCredentials);
  }

  /** verifyBearer chains admin, then public (public key), then private (fast hash). */
  private async verifyBearer(token: string): Promise<VerifyApiKeyResult> {
    const admin = this.verifyAdminKey(token);
    if (admin) return admin;

    const byPublicKey = await this.verifyPublicKey(token);
    if (byPublicKey) return rejectExpired(byPublicKey);

    const byPrivateKey = await this.verifyPrivateKey(token);
    if (byPrivateKey) return rejectExpired(byPrivateKey);

    return unauthorizedError(invalidCredentials);
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

  /** backfillSlowHash bcrypt-verifies keys without a fast hash and backfills matching secrets. */
  private async backfillSlowHash(
    publicKey: string,
    secretKey: string,
  ): Promise<VerifyApiKeyResult | null> {
    const found = await this.apiKeyRepo.findByPublicKey(publicKey);
    if (!found.success) return found;
    if (!found.apiKey || found.apiKey.fastHashedSecretKey !== null) return null;

    let valid: boolean;
    try {
      valid = await verifySecretKey(secretKey, found.apiKey.hashedSecretKey);
    } catch (error) {
      return internalServerError(`slow verify failed: ${String(error)}`);
    }
    if (!valid) return null;

    await this.apiKeyRepo.backfillFastHash(
      found.apiKey.id,
      createShaHash(secretKey, this.salt),
    );
    return privateKey(found.apiKey);
  }

  /** verifyAdminKey recognizes the configured environment admin. */
  private verifyAdminKey(token: string): VerifyApiKeyResult | null {
    return matchesAdminApiKey(token, this.adminApiKey)
      ? { success: true, authorization: "admin" }
      : null;
  }

  /** verifyPublicKey resolves a public-key token to its scores-only presentation, or null when it is not a public key or is unknown.
   * @deprecated Public bearer authentication will be removed in the next major version.
   */
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

/** rejectExpired maps a verified key past its expiry to the unknown-key 401. */
function rejectExpired(result: VerifyApiKeyResult): VerifyApiKeyResult {
  if (
    result.success &&
    result.authorization !== "admin" &&
    isApiKeyExpired(result.apiKey.expiresAt)
  ) {
    return unauthorizedError(invalidCredentials);
  }
  return result;
}

/** VerifiedCredential is the presentation the resolver consumes: an api key with how it was presented, or the admin key. */
type VerifiedCredential =
  | { authorization: "publicKey" | "privateKey"; apiKey: ApiKey }
  | { authorization: "admin" };

/** VerifyApiKeyResult is the verified credential, or a typed failure; verify returns, never throws. */
export type VerifyApiKeyResult =
  | (Success & VerifiedCredential)
  | ErrorResult<
      UnauthorizedError | InternalServerError | ServiceUnavailableError
    >;
