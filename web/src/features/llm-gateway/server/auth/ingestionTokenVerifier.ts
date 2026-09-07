import { env } from "@/src/env.mjs";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server";
import { CloudConfigSchema, UnauthorizedError } from "@langfuse/shared";
import { prisma, type PrismaClient } from "@langfuse/shared/src/db";
import type { AuthHeaderValidVerificationResult } from "@langfuse/shared/src/server";
import { z } from "zod/v4";

import {
  createEd25519JwtVerifier,
  type JwtRegisteredClaims,
} from "@/src/server/utils/jwt";

export const GATEWAY_INGESTION_TOKEN_TTL_SECONDS = 15 * 60;

const GatewayIngestionClaimsSchema = z.object({
  version: z.literal(1),
  organizationId: z.string(),
  projectId: z.string(),
  keyId: z.string(),
  instrumentation_mode: z.enum(["usage", "full"]),
  scope: z.literal("gateway-ingest"),
  exp: z.number().int(),
  iss: z.string(),
  aud: z.string(),
  iat: z.number().int(),
  jti: z.string(),
});

type GatewayIngestionClaims = z.infer<typeof GatewayIngestionClaimsSchema> &
  JwtRegisteredClaims;

const gatewayIngestionTokenVerifier = (() => {
  const publicKeys = [
    ...(env.LANGFUSE_GATEWAY_JWT_PUBLIC_KEY
      ? [
          {
            id: env.LANGFUSE_GATEWAY_JWT_KEY_ID,
            publicKey: env.LANGFUSE_GATEWAY_JWT_PUBLIC_KEY,
          },
        ]
      : []),
    ...(env.LANGFUSE_GATEWAY_JWT_PREVIOUS_KEY_ID &&
    env.LANGFUSE_GATEWAY_JWT_PREVIOUS_PUBLIC_KEY
      ? [
          {
            id: env.LANGFUSE_GATEWAY_JWT_PREVIOUS_KEY_ID,
            publicKey: env.LANGFUSE_GATEWAY_JWT_PREVIOUS_PUBLIC_KEY,
          },
        ]
      : []),
  ];

  return publicKeys.length > 0
    ? createEd25519JwtVerifier({
        issuer: env.LANGFUSE_GATEWAY_JWT_ISSUER,
        audience: env.LANGFUSE_GATEWAY_JWT_AUDIENCE,
        publicKeys,
        claimsSchema: GatewayIngestionClaimsSchema,
      })
    : undefined;
})();

function verifyConfiguredGatewayIngestionToken(
  token: string,
): GatewayIngestionClaims {
  if (!gatewayIngestionTokenVerifier) {
    throw new Error("Gateway ingestion verification is not configured");
  }
  return gatewayIngestionTokenVerifier.verify({ token });
}

export async function verifyGatewayIngestionAuthorization(
  authorization: string | undefined,
  database: PrismaClient = prisma,
): Promise<
  | (AuthHeaderValidVerificationResult & {
      scope: { projectId: string; accessLevel: "project" };
    })
  | null
> {
  const [scheme, token, ...additionalParts] = (authorization ?? "")
    .trim()
    .split(/\s+/);
  if (scheme !== "Bearer" || !token || additionalParts.length > 0) return null;
  if (token.split(".").length !== 3) return null;

  let claims: GatewayIngestionClaims;
  try {
    claims = verifyConfiguredGatewayIngestionToken(token);
  } catch {
    throw new UnauthorizedError("Invalid gateway ingestion token");
  }

  const [project, gatewayKey] = await Promise.all([
    database.project.findFirst({
      where: {
        id: claims.projectId,
        orgId: claims.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        organization: {
          select: {
            id: true,
            cloudConfig: true,
            cloudFreeTierUsageThresholdState: true,
          },
        },
      },
    }),
    database.gatewayApiKeyAssociation.findFirst({
      where: {
        apiKeyId: claims.keyId,
        apiKey: {
          orgId: claims.organizationId,
        },
      },
      select: { apiKeyId: true },
    }),
  ]);
  if (!project || !gatewayKey) {
    throw new UnauthorizedError("Invalid gateway ingestion token project");
  }

  const parsedCloudConfig = CloudConfigSchema.safeParse(
    project.organization.cloudConfig ?? {},
  );
  if (!parsedCloudConfig.success) {
    throw new UnauthorizedError("Invalid gateway ingestion token project");
  }
  const cloudConfig = project.organization.cloudConfig
    ? parsedCloudConfig.data
    : undefined;

  return {
    validKey: true,
    scope: {
      projectId: project.id,
      accessLevel: "project",
      orgId: project.organization.id,
      plan: getOrganizationPlanServerSide(cloudConfig),
      rateLimitOverrides: cloudConfig?.rateLimitOverrides ?? [],
      apiKeyId: claims.keyId,
      publicKey: `gateway:${claims.keyId}`,
      isIngestionSuspended:
        project.organization.cloudFreeTierUsageThresholdState === "BLOCKED",
      isInAppAgentKey: false,
    },
  };
}
