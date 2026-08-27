import { type IncomingHttpHeaders } from "http";

import { type Redis, type Cluster } from "ioredis";

import {
  type ApiKey,
  type PrismaClient,
  prisma as defaultPrisma,
} from "@langfuse/shared/src/db";
import {
  CloudConfigSchema,
  InternalServerError,
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
import {
  ContextResolver,
  type OrgEnrichment,
  type OrgRepo,
} from "./resolveContext";
import { Verifier, type KeyStore } from "./verifier";
import {
  type AuthorizationContext,
  type ErrorResult,
  type Success,
} from "./types";

/** keyStoreCachePrefix namespaces the Verifier cache (`fast hash → ApiKey record`) in redis. */
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

  return buildResolver().resolveContext(verified);
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

/** buildVerifier is the prisma/redis-backed Verifier on its default collaborators. */
function buildVerifier(
  prisma: PrismaClient = defaultPrisma,
  redis: Redis | Cluster | null = defaultRedis,
): Verifier {
  return new Verifier(prismaKeyStore(prisma, redis));
}

/** buildResolver is the ContextResolver bound to the prisma org enricher. */
function buildResolver(prisma: PrismaClient = defaultPrisma): ContextResolver {
  return new ContextResolver(prismaOrgRepo(prisma));
}

/** prismaKeyStore reads `ApiKey` rows by index, read-through cached by fast hash and failing open to Postgres. */
function prismaKeyStore(
  prisma: PrismaClient,
  redis: Redis | Cluster | null,
): KeyStore {
  return {
    findByFastHash: async (hash) => {
      const cached = await readCachedKey(redis, hash);
      if (cached) return cached;
      const row = await prisma.apiKey.findUnique({
        where: { fastHashedSecretKey: hash },
      });
      if (row?.fastHashedSecretKey) await writeCachedKey(redis, hash, row);
      return row;
    },
    findByPublicKey: (publicKey) =>
      prisma.apiKey.findUnique({ where: { publicKey } }),
    verifySlow: (secretKey, apiKey) =>
      verifySecretKey(secretKey, apiKey.hashedSecretKey),
    backfillFastHash: async (apiKey, hash) => {
      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { fastHashedSecretKey: hash },
      });
    },
  };
}

/** prismaOrgRepo enriches an org id into its `PrincipalOrganization` caps and liveness. */
function prismaOrgRepo(prisma: PrismaClient): OrgRepo {
  return {
    enrich: async (orgId) => {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          projects: { where: { deletedAt: null }, select: { id: true } },
        },
      });
      if (!org) {
        throw new InternalServerError(`org ${orgId} not found`);
      }
      const cloudConfig = org.cloudConfig
        ? CloudConfigSchema.parse(org.cloudConfig)
        : undefined;
      return {
        orgId,
        plan: getOrganizationPlanServerSide(cloudConfig),
        rateLimitConfig: cloudConfig?.rateLimitOverrides ?? [],
        projectIds: org.projects.map((p) => p.id),
        isIngestionSuspended:
          org.cloudFreeTierUsageThresholdState === "BLOCKED",
      } satisfies OrgEnrichment;
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
    logger.error("authz Verifier cache read failed, falling open", error);
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
    logger.error("authz Verifier cache write failed", error);
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

/** Authenticated is the resolver's success outcome: the resolved authorization context. */
export type Authenticated = Success & { context: AuthorizationContext };
