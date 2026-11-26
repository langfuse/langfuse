import { env } from "@/src/env.mjs";
import { ForbiddenError, hasEntitlementBasedOnPlan } from "@langfuse/shared";
import { type PrismaClient } from "@langfuse/shared/src/db";
import { getSelfHostedInstancePlanServerSide } from "@langfuse/shared/src/server";

/** Whether LANGFUSE_DISABLE_UI_EXPORTS is set and the instance license covers it. */
export function isUiExportsDisabledByInstance(): boolean {
  return (
    env.LANGFUSE_DISABLE_UI_EXPORTS === "true" &&
    hasEntitlementBasedOnPlan({
      plan: getSelfHostedInstancePlanServerSide(),
      entitlement: "self-host-ui-customization",
    })
  );
}

/**
 * Whether UI-based data exports and downloads are disabled for this project.
 * The org setting applies on every plan: the entitlement only gates turning
 * exports off, so a downgrade never silently re-enables exports the org disabled.
 * Not cached, so disabling takes effect on the next request.
 */
async function isUiExportsDisabledForProject(params: {
  prisma: PrismaClient;
  projectId: string;
}): Promise<boolean> {
  if (isUiExportsDisabledByInstance()) return true;
  const project = await params.prisma.project.findUnique({
    where: { id: params.projectId },
    select: { organization: { select: { uiExportsDisabled: true } } },
  });
  return project?.organization.uiExportsDisabled ?? false;
}

/** Rejects UI-based data export and download requests while exports are disabled. */
export async function throwIfUiExportsDisabled(params: {
  prisma: PrismaClient;
  projectId: string;
}): Promise<void> {
  if (await isUiExportsDisabledForProject(params)) {
    throw new ForbiddenError("UI exports are disabled for this organization.");
  }
}
