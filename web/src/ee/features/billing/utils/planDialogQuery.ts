export const BILLING_PLAN_DIALOG_QUERY = "upgrade";

export function billingSettingsPath(organizationId: string): string {
  return `/organization/${organizationId}/settings/billing`;
}

export function billingPlanDialogHref(organizationId: string): string {
  return `${billingSettingsPath(organizationId)}?${BILLING_PLAN_DIALOG_QUERY}=1`;
}

export function hasBillingPlanDialogQuery(
  value: string | string[] | undefined,
): boolean {
  return value === "1" || value === "true";
}
