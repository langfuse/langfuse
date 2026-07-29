import type { Session } from "next-auth";

import { BaseError, ForbiddenError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";

import { env } from "@/src/env.mjs";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";

export async function assertInAppAgentAvailable({
  prisma,
  projectId,
  user,
}: {
  prisma: PrismaClient;
  projectId: string;
  user: NonNullable<Session["user"]>;
}) {
  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    throw new BaseError(
      "PreconditionFailedError",
      412,
      "In-app agent is not available in this environment yet.",
      true,
    );
  }

  throwIfNoEntitlement({
    entitlement: "in-app-agent",
    sessionUser: user,
    projectId,
  });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      organization: {
        select: {
          id: true,
          cloudConfig: true,
          aiFeaturesEnabled: true,
          aiTelemetryEnabled: true,
        },
      },
    },
  });

  if (!project?.organization.aiFeaturesEnabled) {
    throw new ForbiddenError("Assistant is not enabled for this organization");
  }

  return project.organization;
}
