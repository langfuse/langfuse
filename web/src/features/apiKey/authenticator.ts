import { type IncomingHttpHeaders } from "http";

import {
  type PrismaClient,
  prisma as defaultPrisma,
} from "@langfuse/shared/src/db";
import { InternalServerError, UnauthorizedError } from "@langfuse/shared";
import { verifySecretKey, logger } from "@langfuse/shared/src/server";

import { ContextResolver } from "@/src/features/auth/policy/contextResolver";
import { parseAuthorizationHeader } from "@/src/features/apiKey/helpers/parseAuthorizationHeader";
import { AuthenticatorCache } from "@/src/features/apiKey/authenticatorCache";
import {
  Verifier,
  invalidCredentials,
  type ApiKeyRepository,
} from "@/src/features/apiKey/verifier";
import {
  type AuthorizationContext,
  type ErrorResult,
  type Success,
} from "@/src/features/auth/policy/types";

/** Authenticator resolves a request's credential into an `AuthorizationContext`: cache → verify → gate key kind → resolve. */
export class Authenticator {
  constructor(
    private readonly verifier: Verifier = buildVerifier(),
    private readonly resolver: ContextResolver = new ContextResolver(),
    private readonly cache: AuthenticatorCache = new AuthenticatorCache(),
  ) {}

  /** auth runs the full pipeline read-through the consolidated context cache, returning a typed failure rather than throwing. */
  async auth(params: ApiKeyAuthParams): Promise<ApiKeyAuthResults> {
    const credential = parseAuthorizationHeader(params.headers.authorization);
    if (credential.kind === "malformed") {
      return {
        success: false,
        error: new UnauthorizedError(invalidCredentials),
      };
    }

    const cached = await this.cache.get(credential);
    if (cached) return cached;

    const verified = await this.verifier.verify(credential);
    if (!verified.success) {
      await this.cache.set(credential, verified);
      return verified;
    }

    const gate = gateKeyKind(verified, params);
    if (gate) return gate;

    const resolved = await this.resolver.resolve(verified);
    if (isCacheable(verified)) {
      await this.cache.set(credential, resolved);
    }
    return resolved;
  }
}

/** defaultAuthenticator is the Authenticator on its default prisma/redis collaborators. */
const defaultAuthenticator = new Authenticator();

/** authenticate resolves a request's credential via the default Authenticator. */
export const authenticate = (
  params: ApiKeyAuthParams,
): Promise<ApiKeyAuthResults> => defaultAuthenticator.auth(params);

/** gateKeyKind rejects key kinds a route does not opt into: in-app-agent and admin. */
function gateKeyKind(
  verified: Extract<Awaited<ReturnType<Verifier["verify"]>>, { success: true }>,
  params: ApiKeyAuthParams,
): ErrorResult<UnauthorizedError> | null {
  if (verified.authorization === "admin" && !params.isAdminApiKeyAuthAllowed) {
    return {
      success: false,
      error: new UnauthorizedError("Admin API key auth is not allowed here"),
    };
  }
  if (
    verified.authorization !== "admin" &&
    verified.apiKey.isInAppAgentKey &&
    !params.allowInAppAgentKey
  ) {
    return {
      success: false,
      error: new UnauthorizedError(
        "Access denied - in-app agent keys are not allowed for this endpoint",
      ),
    };
  }
  return null;
}

/** isCacheable rejects contexts whose route-specific gate must rerun every request: admin and in-app-agent keys. */
function isCacheable(
  verified: Extract<Awaited<ReturnType<Verifier["verify"]>>, { success: true }>,
): boolean {
  if (verified.authorization === "admin") return false;
  return !verified.apiKey.isInAppAgentKey;
}

/** buildVerifier is the prisma-backed Verifier on its default collaborators. */
function buildVerifier(prisma: PrismaClient = defaultPrisma): Verifier {
  return new Verifier(prismaApiKeyRepository(prisma));
}

/** prismaApiKeyRepository reads `ApiKey` rows by index, returning infra failures as values; caching lives at the Authenticator, not here. */
function prismaApiKeyRepository(prisma: PrismaClient): ApiKeyRepository {
  return {
    findByFastHash: async (hash) => {
      try {
        const apiKey = await prisma.apiKey.findUnique({
          where: { fastHashedSecretKey: hash },
        });
        return { success: true, apiKey };
      } catch (error) {
        return {
          success: false,
          error: new InternalServerError(
            `api key lookup by fast hash failed: ${String(error)}`,
          ),
        };
      }
    },
    findByPublicKey: async (publicKey) => {
      try {
        const apiKey = await prisma.apiKey.findUnique({ where: { publicKey } });
        return { success: true, apiKey };
      } catch (error) {
        return {
          success: false,
          error: new InternalServerError(
            `api key lookup by public key failed: ${String(error)}`,
          ),
        };
      }
    },
    verifySlow: async (secretKey, apiKey) => {
      try {
        return {
          success: true,
          valid: await verifySecretKey(secretKey, apiKey.hashedSecretKey),
        };
      } catch (error) {
        return {
          success: false,
          error: new InternalServerError(
            `slow verify failed: ${String(error)}`,
          ),
        };
      }
    },
    backfillFastHash: async (apiKey, hash) => {
      try {
        await prisma.apiKey.update({
          where: { id: apiKey.id },
          data: { fastHashedSecretKey: hash },
        });
      } catch (error) {
        logger.error("authz api key fast-hash backfill failed", error);
      }
    },
  };
}

/** ApiKeyAuthParams is the request headers plus the route's key-kind opt-ins. */
export type ApiKeyAuthParams = {
  headers: IncomingHttpHeaders;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
};

/** ApiKeyAuthResults is the pipeline's outcome: the resolved context, or a typed failure. */
export type ApiKeyAuthResults =
  | Authenticated
  | ErrorResult<UnauthorizedError | InternalServerError>;

/** Authenticated is the pipeline's success outcome: the resolved authorization context. */
export type Authenticated = Success & { context: AuthorizationContext };
