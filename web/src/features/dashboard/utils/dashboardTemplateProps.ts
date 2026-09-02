import { resolveDashboardTemplate } from "@langfuse/shared";

/** Metadata-only: emits a known Langfuse template enum, never a user dashboard name. */
export const dashboardTemplateProps = (dashboardId: string) => {
  const dashboardTemplate = resolveDashboardTemplate(dashboardId);
  return dashboardTemplate ? { dashboardTemplate } : {};
};
