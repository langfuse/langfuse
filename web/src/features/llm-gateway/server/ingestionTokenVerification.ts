import { env } from "@/src/env.mjs";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { CloudConfigSchema, UnauthorizedError } from "@langfuse/shared";
import { prisma, type PrismaClient } from "@langfuse/shared/src/db";
import type { AuthHeaderValidVerificationResult } from "@langfuse/shared/src/server";

import {
  type GatewayIngestionClaims,
  verifyGatewayIngestionToken,
} from "./auth";

function verifyConfiguredGatewayIngestionToken(
  token: string,
): GatewayIngestionClaims {
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
  if (publicKeys.length === 0) {
    throw new Error("Gateway ingestion verification is not configured");
  }
  return verifyGatewayIngestionToken({
    token,
    issuer: env.LANGFUSE_GATEWAY_JWT_ISSUER,
    audience: env.LANGFUSE_GATEWAY_JWT_AUDIENCE,
    publicKeys,
  });
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
  const token = /^Bearer (.+)$/.exec(authorization ?? "")?.[1];
  if (!token || token.split(".").length !== 3) return null;

  let claims: GatewayIngestionClaims;
  try {
    claims = verifyConfiguredGatewayIngestionToken(token);
  } catch {
    throw new UnauthorizedError("Invalid gateway ingestion token");
  }

  const project = await database.project.findFirst({
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
      apiKeyId: claims.keyId,
      publicKey: `gateway:${claims.keyId}`,
      isIngestionSuspended:
        project.organization.cloudFreeTierUsageThresholdState === "BLOCKED",
      isInAppAgentKey: false,
    },
  };
}
