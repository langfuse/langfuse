/**
 * OIDC bearer-token authentication for the MCP endpoint.
 *
 * Validates `Authorization: Bearer <JWT>` against a configured OIDC issuer
 * using its JWKS, then resolves the JWT principal to a Langfuse user and
 * requires a project membership for the project identified by the
 * `X-Langfuse-Project-Id` request header.
 *
 * Project selection is header-based, not claim-based, so the same JWT can
 * be reused across projects the user is a member of without re-issuing tokens.
 *
 * Synthetic `apiKeyId` / `publicKey` strings of the form `oidc:<userId>` and
 * `oidc` are populated on the resulting ServerContext so audit logs and
 * downstream public-API helpers keep working unchanged; the real per-user
 * identity is on `userId` and `authMethod === "oidc"`.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { type NextApiRequest } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { type ServerContext } from "@/src/features/mcp/types";

const PROJECT_ID_HEADER = "x-langfuse-project-id";

type CachedJwks = {
  issuer: string;
  jwksUri: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
};

let cachedJwks: CachedJwks | null = null;

function getJwks(issuer: string, jwksUri: string) {
  if (
    cachedJwks &&
    cachedJwks.issuer === issuer &&
    cachedJwks.jwksUri === jwksUri
  ) {
    return cachedJwks.jwks;
  }
  const jwks = createRemoteJWKSet(new URL(jwksUri));
  cachedJwks = { issuer, jwksUri, jwks };
  return jwks;
}

export function isOidcEnabled(): boolean {
  return (
    env.MCP_AUTH_OIDC_ENABLED === "true" &&
    typeof env.MCP_AUTH_OIDC_ISSUER === "string" &&
    env.MCP_AUTH_OIDC_ISSUER.length > 0
  );
}

export function extractBearerToken(
  authHeader: string | string[] | undefined,
): string | null {
  const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1].trim() : null;
}

export async function verifyOidcToken(token: string): Promise<JWTPayload> {
  if (!isOidcEnabled() || !env.MCP_AUTH_OIDC_ISSUER) {
    throw new UnauthorizedError("OIDC authentication is not enabled");
  }

  const issuer = env.MCP_AUTH_OIDC_ISSUER;
  const jwksUri =
    env.MCP_AUTH_OIDC_JWKS_URI ??
    new URL(
      "/.well-known/jwks.json",
      issuer.endsWith("/") ? issuer : `${issuer}/`,
    ).toString();

  const jwks = getJwks(issuer, jwksUri);

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: env.MCP_AUTH_OIDC_AUDIENCE,
    });
    return payload;
  } catch (err) {
    throw new UnauthorizedError(
      `Invalid OIDC token: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }
}

function extractPrincipalIdentifier(payload: JWTPayload): string {
  const claim = env.MCP_AUTH_OIDC_USER_CLAIM ?? "email";
  const value = (payload as Record<string, unknown>)[claim];
  if (typeof value !== "string" || value.length === 0) {
    throw new UnauthorizedError(`OIDC token missing required claim '${claim}'`);
  }
  return value;
}

export async function resolveOidcContextFromRequest(
  req: NextApiRequest,
  token: string,
): Promise<ServerContext> {
  const payload = await verifyOidcToken(token);
  const principal = extractPrincipalIdentifier(payload);
  const claim = env.MCP_AUTH_OIDC_USER_CLAIM ?? "email";

  const user =
    claim === "sub"
      ? await prisma.user.findUnique({
          where: { id: principal },
          select: { id: true },
        })
      : await prisma.user.findUnique({
          where: { email: principal },
          select: { id: true },
        });

  if (!user) {
    throw new ForbiddenError(
      `No Langfuse user found for OIDC principal '${principal}'`,
    );
  }

  const projectHeader = req.headers[PROJECT_ID_HEADER];
  const projectId = Array.isArray(projectHeader)
    ? projectHeader[0]
    : projectHeader;
  if (!projectId) {
    throw new UnauthorizedError(
      `OIDC authentication requires the '${PROJECT_ID_HEADER}' request header`,
    );
  }

  const membership = await prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: {
      role: true,
      organizationMembership: { select: { orgId: true } },
    },
  });

  if (!membership) {
    throw new ForbiddenError(
      `User '${principal}' is not a member of project '${projectId}'`,
    );
  }

  logger.info("MCP request authenticated via OIDC", {
    projectId,
    orgId: membership.organizationMembership.orgId,
    userId: user.id,
    role: membership.role,
  });

  return {
    projectId,
    orgId: membership.organizationMembership.orgId,
    userId: user.id,
    apiKeyId: `oidc:${user.id}`,
    accessLevel: "project",
    publicKey: "oidc",
    authMethod: "oidc",
  };
}
