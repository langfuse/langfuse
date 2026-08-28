import { type IncomingHttpHeaders } from "http";

import { type Redis, type Cluster } from "ioredis";

import {
  type ApiKey,
  type Organization,
  type PrismaClient,
  prisma as defaultPrisma,
} from "@langfuse/shared/src/db";
import {
  CloudConfigSchema,
  InternalServerError,
  LangfuseNotFoundError,
  UnauthorizedError,
} from "@langfuse/shared";
import {
  redis as defaultRedis,
  verifySecretKey,
  logger,
  createAuthzContextCacheKey,
} from "@langfuse/shared/src/server";

import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { env } from "@/src/env.mjs";
import { resolveContext } from "@/src/features/auth/policy/resolveContext";
import {
  Verifier,
  type ApiKeyRepository,
} from "@/src/features/apiKey/verifier";
import {
  type AuthorizationContext,
  type ErrorResult,
  type PrincipalOrganization,
  type Success,
} from "@/src/features/auth/policy/types";

/** headerValue normalizes a possibly-repeated header to its first value. */
const headerValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

/** Authenticator resolves a request's credential into an `AuthorizationContext`: cache → verify → gate key kind → load org → enrich → resolve. */
export class Authenticator {
  constructor(
    private readonly verifier: Verifier = buildVerifier(),
    private readonly orgs: OrganizationRepository = buildOrgRepo(),
    private readonly cache: ContextCache = buildContextCache(),
  ) {}

  /** auth runs the full pipeline read-through the consolidated context cache, returning a typed failure rather than throwing. */
  async auth(params: ApiKeyAuthParams): Promise<ApiKeyAuthResults> {
    const authHeader = headerValue(params.headers.authorization);
    const cacheKey = this.verifier.cacheKey(authHeader);

    if (cacheKey) {
      const cached = await this.cache.read(cacheKey);
      if (cached) return cached;
    }

    const verified = await this.verifier.verify(authHeader);
    if (!verified.success) {
      if (cacheKey && verified.error instanceof UnauthorizedError) {
        await this.cache.writeUnauthorized(cacheKey, verified.error);
      }
      return verified;
    }

    const gate = gateKeyKind(verified, params);
    if (gate) return gate;

    if (verified.authorization === "adminKey") {
      return resolveContext({ authorization: "adminKey" });
    }

    const enriched = await this.enrichOrg(verified.apiKey);
    if (!enriched.success) return enriched;

    const resolved = resolveContext({
      authorization: verified.authorization,
      apiKey: verified.apiKey,
      organization: enriched.organization,
    });

    // In-app-agent keys ride a route-specific gate; caching their context would
    // let a hit skip the gate on a route that disallows them.
    if (cacheKey && !verified.apiKey.isInAppAgentKey) {
      await this.cache.writeContext(cacheKey, resolved.context);
    }
    return resolved;
  }

  /** enrichOrg loads and derives the key's `PrincipalOrganization`, mapping a missing org to a 500 invariant break. */
  private async enrichOrg(
    apiKey: ApiKey,
  ): Promise<
    | (Success & { organization: PrincipalOrganization })
    | ErrorResult<InternalServerError>
  > {
    if (apiKey.orgId === null) {
      return {
        success: false,
        error: new InternalServerError(`key ${apiKey.id} has no orgId`),
      };
    }
    const found = await this.orgs.getByOrgId(apiKey.orgId);
    if (!found.success) {
      return {
        success: false,
        error:
          found.error instanceof InternalServerError
            ? found.error
            : new InternalServerError(found.error.message),
      };
    }
    return { success: true, organization: enrich(found.organization) };
  }
}

/** defaultAuthenticator is the Authenticator on its default prisma/redis collaborators. */
export const defaultAuthenticator = new Authenticator();

/** gateKeyKind rejects key kinds a route does not opt into: in-app-agent and admin. */
function gateKeyKind(
  verified: Extract<Awaited<ReturnType<Verifier["verify"]>>, { success: true }>,
  params: ApiKeyAuthParams,
): ErrorResult<UnauthorizedError> | null {
  if (
    verified.authorization === "adminKey" &&
    !params.isAdminApiKeyAuthAllowed
  ) {
    return {
      success: false,
      error: new UnauthorizedError("Admin API key auth is not allowed here"),
    };
  }
  if (
    verified.authorization !== "adminKey" &&
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

/** enrich derives an org's `PrincipalOrganization` caps and liveness from its raw row. */
function enrich(org: OrganizationWithProjects): PrincipalOrganization {
  const cloudConfig = org.cloudConfig
    ? CloudConfigSchema.parse(org.cloudConfig)
    : undefined;
  return {
    orgId: org.id,
    plan: getOrganizationPlanServerSide(cloudConfig),
    rateLimitConfig: cloudConfig?.rateLimitOverrides ?? [],
    projectIds: org.projects.map((p) => p.id),
    isIngestionSuspended: org.cloudFreeTierUsageThresholdState === "BLOCKED",
  };
}

/** buildVerifier is the prisma-backed Verifier on its default collaborators. */
function buildVerifier(prisma: PrismaClient = defaultPrisma): Verifier {
  return new Verifier(prismaApiKeyRepository(prisma));
}

/** buildOrgRepo is the prisma-backed OrganizationRepository on its default client. */
function buildOrgRepo(
  prisma: PrismaClient = defaultPrisma,
): OrganizationRepository {
  return prismaOrganizationRepository(prisma);
}

/** buildContextCache is the redis-backed ContextCache on the default client. */
function buildContextCache(
  redis: Redis | Cluster | null = defaultRedis,
): ContextCache {
  return redisContextCache(redis);
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

/** prismaOrganizationRepository reads an org with its live projects, returning a miss or infra failure as a value. */
function prismaOrganizationRepository(
  prisma: PrismaClient,
): OrganizationRepository {
  return {
    getByOrgId: async (id) => {
      try {
        const organization = await prisma.organization.findUnique({
          where: { id },
          include: {
            projects: { where: { deletedAt: null }, select: { id: true } },
          },
        });
        if (!organization) {
          return {
            success: false,
            error: new LangfuseNotFoundError(`org ${id} not found`),
          };
        }
        return { success: true, organization };
      } catch (error) {
        return {
          success: false,
          error: new InternalServerError(
            `failed to load org ${id}: ${String(error)}`,
          ),
        };
      }
    },
  };
}

/** cacheEnabled is the shared on/off switch for the context cache, reusing the legacy api-key cache flag. */
function cacheEnabled(redis: Redis | Cluster | null): redis is Redis | Cluster {
  return Boolean(redis) && env.LANGFUSE_CACHE_API_KEY_ENABLED === "true";
}

/** redisContextCache stores the materialized `AuthorizationContext` (and negative 401s) under the `authz:context:` namespace, failing open on any redis error. */
export function redisContextCache(redis: Redis | Cluster | null): ContextCache {
  const set = async (key: string, entry: CachedEntry): Promise<void> => {
    if (!cacheEnabled(redis)) return;
    try {
      await redis.set(
        createAuthzContextCacheKey(key),
        JSON.stringify(entry),
        "EX",
        env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS,
      );
    } catch (error) {
      logger.error("authz context cache write failed", error);
    }
  };

  return {
    read: async (key) => {
      if (!cacheEnabled(redis)) return null;
      try {
        const raw = await redis.get(createAuthzContextCacheKey(key));
        if (!raw) return null;
        const entry = JSON.parse(raw) as CachedEntry;
        if ("context" in entry) {
          return { success: true, context: entry.context };
        }
        return {
          success: false,
          error: new UnauthorizedError(entry.unauthorized),
        };
      } catch (error) {
        logger.error("authz context cache read failed, falling open", error);
        return null;
      }
    },
    writeContext: (key, context) => set(key, { context }),
    writeUnauthorized: (key, error) =>
      set(key, { unauthorized: error.message }),
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

/** CachedEntry is the redis-serialized cache value: a materialized context, or a negative 401 body. */
type CachedEntry = { context: AuthorizationContext } | { unauthorized: string };

/** ContextCache is the consolidated read-through cache the Authenticator wraps its pipeline in. */
export type ContextCache = {
  read: (
    key: string,
  ) => Promise<Authenticated | ErrorResult<UnauthorizedError> | null>;
  writeContext: (key: string, context: AuthorizationContext) => Promise<void>;
  writeUnauthorized: (key: string, error: UnauthorizedError) => Promise<void>;
};

/** OrganizationWithProjects is the raw org row plus its live project ids. */
export type OrganizationWithProjects = Organization & {
  projects: { id: string }[];
};

/** OrganizationRepository loads an org by id, returning a miss or infra failure as a value. */
export type OrganizationRepository = {
  getByOrgId: (
    id: string,
  ) => Promise<
    | (Success & { organization: OrganizationWithProjects })
    | ErrorResult<LangfuseNotFoundError | InternalServerError>
  >;
};
