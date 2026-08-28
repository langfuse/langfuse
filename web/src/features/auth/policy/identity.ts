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
} from "@langfuse/shared/src/server";

import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { env } from "@/src/env.mjs";
import { headerValue } from "./enforce";
import { resolveContext } from "./resolveContext";
import { Verifier, type ApiKeyRepository } from "./verifier";
import {
  type AuthorizationContext,
  type ErrorResult,
  type PrincipalOrganization,
  type Success,
} from "./types";

/** keyStoreCachePrefix namespaces the api-key fast-hash cache (`fast hash → ApiKey record`) in redis. */
const keyStoreCachePrefix = "authz:apikey:";

/** authenticate resolves a request's credential into an `AuthorizationContext`, returning a typed failure rather than throwing. */
export async function authenticate(
  params: AuthenticateParams,
): Promise<
  Authenticated | ErrorResult<UnauthorizedError | InternalServerError>
> {
  const authHeader = headerValue(params.headers.authorization);
  const verified = await buildVerifier().verify(authHeader);
  if (!verified.success) return verified;

  const gate = gateKeyKind(verified, params);
  if (gate) return gate;

  if (verified.authorization === "adminKey") {
    return resolveContext({ authorization: "adminKey" });
  }

  const enriched = await enrichOrg(verified.apiKey);
  if (!enriched.success) return enriched;

  return resolveContext({
    authorization: verified.authorization,
    apiKey: verified.apiKey,
    organization: enriched.organization,
  });
}

/** gateKeyKind rejects key kinds a route does not opt into: in-app-agent and admin. */
function gateKeyKind(
  verified: Extract<Awaited<ReturnType<Verifier["verify"]>>, { success: true }>,
  params: AuthenticateParams,
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

/** enrichOrg loads and derives the key's `PrincipalOrganization`, mapping a missing org to a 500 invariant break. */
async function enrichOrg(
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
  const found = await buildOrgRepo().getByOrgId(apiKey.orgId);
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

/** buildVerifier is the prisma/redis-backed Verifier on its default collaborators. */
function buildVerifier(
  prisma: PrismaClient = defaultPrisma,
  redis: Redis | Cluster | null = defaultRedis,
): Verifier {
  return new Verifier(prismaApiKeyRepository(prisma, redis));
}

/** buildOrgRepo is the prisma-backed OrganizationRepository on its default client. */
function buildOrgRepo(
  prisma: PrismaClient = defaultPrisma,
): OrganizationRepository {
  return prismaOrganizationRepository(prisma);
}

/** prismaApiKeyRepository reads `ApiKey` rows by index, read-through cached by fast hash, returning infra failures as values. */
function prismaApiKeyRepository(
  prisma: PrismaClient,
  redis: Redis | Cluster | null,
): ApiKeyRepository {
  return {
    findByFastHash: async (hash) => {
      try {
        const cached = await readCachedKey(redis, hash);
        if (cached) return { success: true, apiKey: cached };
        const row = await prisma.apiKey.findUnique({
          where: { fastHashedSecretKey: hash },
        });
        if (row?.fastHashedSecretKey) await writeCachedKey(redis, hash, row);
        return { success: true, apiKey: row };
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

/** readCachedKey reads a cached `ApiKey` row by fast hash, failing open on any redis error. */
async function readCachedKey(
  redis: Redis | Cluster | null,
  hash: string,
): Promise<ApiKey | null> {
  if (!redis || env.LANGFUSE_CACHE_API_KEY_ENABLED !== "true") return null;
  try {
    const raw = await redis.get(`${keyStoreCachePrefix}${hash}`);
    return raw ? (deserializeKey(raw) ?? null) : null;
  } catch (error) {
    logger.error("authz api key cache read failed, falling open", error);
    return null;
  }
}

/** writeCachedKey caches an `ApiKey` row by fast hash on the absolute API-key TTL, swallowing redis errors. */
async function writeCachedKey(
  redis: Redis | Cluster | null,
  hash: string,
  apiKey: ApiKey,
): Promise<void> {
  if (!redis || env.LANGFUSE_CACHE_API_KEY_ENABLED !== "true") return;
  try {
    await redis.set(
      `${keyStoreCachePrefix}${hash}`,
      JSON.stringify({ ...apiKey, createdAt: apiKey.createdAt.toISOString() }),
      "EX",
      env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS,
    );
  } catch (error) {
    logger.error("authz api key cache write failed", error);
  }
}

/** deserializeKey rehydrates a cached `ApiKey` row's dates, or undefined if malformed. */
function deserializeKey(raw: string): ApiKey | undefined {
  try {
    const parsed = JSON.parse(raw) as ApiKey & { createdAt: string };
    return { ...parsed, createdAt: new Date(parsed.createdAt) };
  } catch {
    return undefined;
  }
}

/** AuthenticateParams is the request headers plus the route's key-kind opt-ins. */
export type AuthenticateParams = {
  headers: IncomingHttpHeaders;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
};

/** Authenticated is the pipeline's success outcome: the resolved authorization context. */
export type Authenticated = Success & { context: AuthorizationContext };

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
