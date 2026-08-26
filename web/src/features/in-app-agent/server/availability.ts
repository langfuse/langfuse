import type { Session } from "next-auth";

import { BaseError, ForbiddenError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  getInAppAgentModelConfig,
  isInAppAgentInstanceEnabled,
  LANGFUSE_AI_MODEL_UNCONFIGURED_MESSAGE,
} from "@langfuse/shared/in-app-agent/server/modelProvider";

import { hasEntitlement } from "@/src/features/entitlements/server/hasEntitlement";

export async function assertInAppAgentAvailable({
  prisma,
  projectId,
  user,
}: {
  prisma: PrismaClient;
  projectId: string;
  user: NonNullable<Session["user"]>;
}) {
  if (!isInAppAgentInstanceEnabled()) {
    throw new BaseError(
      "PreconditionFailedError",
      412,
      "In-app agent is not enabled on this instance.",
      true,
    );
  }

  if (
    !hasEntitlement({
      entitlement: "in-app-agent",
      sessionUser: user,
      projectId,
    })
  ) {
    throw new ForbiddenError(
      "Unauthorized, user does not have access to entitlement: in-app-agent",
    );
  }

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
    throw new ForbiddenError(
      "In-app agent is not enabled for this organization",
    );
  }

  return project.organization;
}

/** Only startRun and approval continuation dispatch to the model. */
export function assertInAppAgentModelConfigured() {
  const modelConfig = getInAppAgentModelConfig();

  if (!modelConfig) {
    throw new BaseError(
      "PreconditionFailedError",
      412,
      LANGFUSE_AI_MODEL_UNCONFIGURED_MESSAGE,
      true,
    );
  }

  return modelConfig;
}
