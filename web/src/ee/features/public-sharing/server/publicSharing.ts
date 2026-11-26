import { env } from "@/src/env.mjs";
import { ForbiddenError, hasEntitlementBasedOnPlan } from "@langfuse/shared";
import { type PrismaClient } from "@langfuse/shared/src/db";
import { getSelfHostedInstancePlanServerSide } from "@langfuse/shared/src/server";

/** Whether LANGFUSE_DISABLE_PUBLIC_SHARING is set and the instance license covers it. */
export function isPublicSharingDisabledByInstance(): boolean {
  return (
    env.LANGFUSE_DISABLE_PUBLIC_SHARING === "true" &&
    hasEntitlementBasedOnPlan({
      plan: getSelfHostedInstancePlanServerSide(),
      entitlement: "self-host-ui-customization",
    })
  );
}

/**
 * Whether `public` flags on this project's traces and sessions are ignored.
 * The org setting applies on every plan: the entitlement only gates turning
 * it on, so a downgrade never re-exposes links the org stopped sharing.
 * Not cached, so disabling takes effect on the next request.
 */
export async function isPublicSharingDisabledForProject(params: {
  prisma: PrismaClient;
  projectId: string;
}): Promise<boolean> {
  if (isPublicSharingDisabledByInstance()) return true;
  const project = await params.prisma.project.findUnique({
    where: { id: params.projectId },
    select: { organization: { select: { publicSharingDisabled: true } } },
  });
  return project?.organization.publicSharingDisabled ?? false;
}

/** Rejects making a trace or session public. Unsharing stays allowed. */
export async function throwIfPublicSharingDisabled(params: {
  prisma: PrismaClient;
  projectId: string;
}): Promise<void> {
  if (await isPublicSharingDisabledForProject(params)) {
    throw new ForbiddenError(
      "Public sharing is disabled for this organization.",
    );
  }
}
