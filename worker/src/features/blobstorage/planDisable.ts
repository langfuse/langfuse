export const PLAN_DISABLED_ERROR =
  "Scheduled blob storage exports are not included in your organization's plan. Upgrade the plan to re-enable the export, or delete the integration.";

// Selects the integration unless the scheduler disabled it for its plan. An
// export run that was already in flight must not replace that reason.
export const unlessPlanDisabled = (projectId: string) => ({
  projectId,
  OR: [
    { enabled: true },
    { lastError: null },
    { lastError: { not: PLAN_DISABLED_ERROR } },
  ],
});
