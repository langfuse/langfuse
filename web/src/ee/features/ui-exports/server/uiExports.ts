import { env } from "@/src/env.mjs";
import {
  UI_EXPORTS_DISABLED_BY_INSTANCE_REASON,
  UI_EXPORTS_DISABLED_BY_ORG_REASON,
} from "@/src/ee/features/ui-exports/constants";
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
 * User-facing reason UI exports and downloads are disabled for this project,
 * or null when allowed. The org setting applies on every plan: the entitlement
 * only gates turning exports off, so a downgrade never silently re-enables
 * exports the org disabled. Not cached, so disabling takes effect on the next
 * request.
 */
export async function getUiExportsDisabledReasonForProject(params: {
  prisma: PrismaClient;
  projectId: string;
}): Promise<string | null> {
  if (isUiExportsDisabledByInstance()) {
    return UI_EXPORTS_DISABLED_BY_INSTANCE_REASON;
  }
  const project = await params.prisma.project.findUnique({
    where: { id: params.projectId },
    select: { organization: { select: { uiExportsDisabled: true } } },
  });
  return project?.organization.uiExportsDisabled
    ? UI_EXPORTS_DISABLED_BY_ORG_REASON
    : null;
}

/** Rejects UI-based data export and download requests while exports are disabled. */
export async function throwIfUiExportsDisabled(params: {
  prisma: PrismaClient;
  projectId: string;
}): Promise<void> {
  const reason = await getUiExportsDisabledReasonForProject(params);
  if (reason) {
    throw new ForbiddenError(reason);
  }
}
