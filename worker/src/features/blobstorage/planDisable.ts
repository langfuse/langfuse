import { prisma } from "@langfuse/shared/src/db";

export const PLAN_DISABLED_ERROR =
  "Scheduled blob storage exports are not included in your organization's plan. Upgrade the plan to re-enable the export, or delete the integration.";

// Selects the integration unless the scheduler disabled it for its plan. An
// export run that was already in flight must not replace that reason.
const unlessPlanDisabled = (projectId: string) => ({
  projectId,
  OR: [
    { enabled: true },
    { lastError: null },
    { lastError: { not: PLAN_DISABLED_ERROR } },
  ],
});

// Writes lastError (null clears it) unless the plan-disable reason is set.
export const setLastError = (projectId: string, lastError: string | null) =>
  prisma.blobStorageIntegration.updateMany({
    where: unlessPlanDisabled(projectId),
    data: { lastError, lastErrorAt: lastError === null ? null : new Date() },
  });
