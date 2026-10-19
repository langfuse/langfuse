import {
  type ApiKey,
  type PrismaClient,
  prisma as defaultPrisma,
} from "@langfuse/shared/src/db";
import {
  type InternalServerError,
  type ServiceUnavailableError,
} from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

import {
  internalServerError,
  serviceUnavailableError,
  type ErrorResult,
  type Success,
} from "@/src/features/auth/policy/types";
import { isPrismaException } from "@/src/utils/exceptions";

/** ApiKeyRepository reads `ApiKey` rows by the two disjoint unique indexes and backfills the fast hash, returning infra failures as values; caching lives at the Authenticator. */
export class ApiKeyRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /** findByFastHash looks a key up by its fast-hash unique index. */
  async findByFastHash(fastHashedSecretKey: string): Promise<FindApiKeyResult> {
    try {
      const apiKey = await this.prisma.apiKey.findUnique({
        where: { fastHashedSecretKey },
      });
      return { success: true, apiKey };
    } catch (error) {
      return dbError(
        `api key lookup by fast hash failed: ${String(error)}`,
        error,
      );
    }
  }

  /** findByPublicKey looks a key up by its public-key unique index. */
  async findByPublicKey(publicKey: string): Promise<FindApiKeyResult> {
    try {
      const apiKey = await this.prisma.apiKey.findUnique({
        where: { publicKey },
      });
      return { success: true, apiKey };
    } catch (error) {
      return dbError(
        `api key lookup by public key failed: ${String(error)}`,
        error,
      );
    }
  }

  /** backfillFastHash writes a key's fast hash, swallowing failures. */
  async backfillFastHash(apiKeyId: string, hash: string): Promise<void> {
    try {
      await this.prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { fastHashedSecretKey: hash },
      });
    } catch (error) {
      logger.error("authz api key fast-hash backfill failed", error);
    }
  }
}

/** dbError classifies a caught database error: a transient infra failure as 503, anything else as 500. */
function dbError(
  message: string,
  error: unknown,
): ErrorResult<ServiceUnavailableError | InternalServerError> {
  return isPrismaException(error)
    ? serviceUnavailableError(message)
    : internalServerError(message);
}

/** FindApiKeyResult is a hit, a miss (null), or an infra failure; a miss is normal control flow, not an error. */
export type FindApiKeyResult =
  | (Success & { apiKey: ApiKey | null })
  | ErrorResult<ServiceUnavailableError | InternalServerError>;
