import { env } from "@/src/env.mjs";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server";
import { CloudConfigSchema, UnauthorizedError } from "@langfuse/shared";
import { prisma, type PrismaClient } from "@langfuse/shared/src/db";
import type { AuthHeaderValidVerificationResult } from "@langfuse/shared/src/server";
import { z } from "zod/v4";

import {
  createEs256JwtVerifier,
  type JwtRegisteredClaims,
} from "@/src/server/utils/jwt";
import { requireGatewayEnabledForOrganization } from "../availability";
import { verifyGatewayAuthorization } from "./gatewayAuthVerifier";

export const GATEWAY_INGESTION_TOKEN_TTL_SECONDS = 15 * 60;

const GatewayIngestionClaimsSchema = z.object({
  version: z.literal(1),
  organization_id: z.string(),
  project_id: z.string(),
  ingestion_mode: z.enum(["usage", "full"]),
  scope: z.literal("gateway-ingest"),
  exp: z.number().int(),
  iss: z.string(),
  aud: z.string(),
  iat: z.number().int(),
  jti: z.string(),
});

type GatewayIngestionClaims = z.infer<typeof GatewayIngestionClaimsSchema> &
  JwtRegisteredClaims;

function configuredPublicKey(input: {
  keyId: string | undefined;
  publicKey: string | undefined;
  keyIdVariable: string;
  publicKeyVariable: string;
}) {
  if (!input.keyId && !input.publicKey) return [];
  if (!input.keyId || !input.publicKey) {
    throw new Error(
      `${input.keyIdVariable} and ${input.publicKeyVariable} must be set together`,
    );
  }
  return [{ id: input.keyId, publicKey: input.publicKey }];
}

const gatewayIngestionTokenVerifier = (() => {
  const publicKeys = [
    ...configuredPublicKey({
      keyId: env.LANGFUSE_GATEWAY_JWT_KEY_ID,
      publicKey: env.LANGFUSE_GATEWAY_JWT_PUBLIC_KEY,
      keyIdVariable: "LANGFUSE_GATEWAY_JWT_KEY_ID",
      publicKeyVariable: "LANGFUSE_GATEWAY_JWT_PUBLIC_KEY",
    }),
    ...configuredPublicKey({
      keyId: env.LANGFUSE_GATEWAY_JWT_PREVIOUS_KEY_ID,
      publicKey: env.LANGFUSE_GATEWAY_JWT_PREVIOUS_PUBLIC_KEY,
      keyIdVariable: "LANGFUSE_GATEWAY_JWT_PREVIOUS_KEY_ID",
      publicKeyVariable: "LANGFUSE_GATEWAY_JWT_PREVIOUS_PUBLIC_KEY",
    }),
  ];

  return publicKeys.length > 0
    ? createEs256JwtVerifier({
        issuer: env.LANGFUSE_GATEWAY_JWT_ISSUER,
        audience: env.LANGFUSE_GATEWAY_JWT_AUDIENCE,
        publicKeys,
        claimsSchema: GatewayIngestionClaimsSchema,
      })
    : undefined;
})();

export async function verifyGatewayIngestionAuthorization(
  authorization: string | undefined,
  gatewayAuthorization: string | string[] | undefined,
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

  // On a deployment without gateway signing keys this path is inert: fall
  // through so the regular API-key verifier still gets to see the header.
  if (!gatewayIngestionTokenVerifier) return null;

  const serviceKeys = [
    ...(env.LANGFUSE_GATEWAY_SERVICE_KEY
      ? [env.LANGFUSE_GATEWAY_SERVICE_KEY]
      : []),
    ...(env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS
      ? [env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS]
      : []),
  ];
  if (
    Array.isArray(gatewayAuthorization) ||
    !verifyGatewayAuthorization(
      {
        credential: token,
        gatewayAuthorization,
      },
      serviceKeys,
    )
  ) {
    throw new UnauthorizedError("Invalid gateway ingestion authorization");
  }

  let claims: GatewayIngestionClaims;
  try {
    claims = gatewayIngestionTokenVerifier.verify({ token });
  } catch {
    throw new UnauthorizedError("Invalid gateway ingestion token");
  }
  requireGatewayEnabledForOrganization(claims.organization_id);

  const project = await database.project.findFirst({
    where: {
      id: claims.project_id,
      orgId: claims.organization_id,
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
  });
  if (!project) {
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
      apiKeyId: claims.jti,
      publicKey: `gateway:${claims.jti}`,
      isIngestionSuspended:
        project.organization.cloudFreeTierUsageThresholdState === "BLOCKED",
      isInAppAgentKey: false,
    },
  };
}
