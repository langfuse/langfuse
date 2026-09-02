/**
 * Deterministic ids for Langfuse-owned dashboard templates.
 * Safe to send to product analytics: these are our templates, not user content.
 */
export const DASHBOARD_TEMPLATE_IDS = {
  home: "langfuse-home-dashboard",
  cost_tracking: "cmawoi7yd00aqad07f3why08w",
  latency_tracking: "cmawk4ywj00jmad072jn7s0ru",
  usage_management: "cmawln8k700xqad07000k1q8b",
  tool_usage: "cmtdm68000006ad07dzdb73zw",
} as const;

export type DashboardTemplate = keyof typeof DASHBOARD_TEMPLATE_IDS;

const DASHBOARD_ID_TO_TEMPLATE = Object.fromEntries(
  Object.entries(DASHBOARD_TEMPLATE_IDS).map(([template, id]) => [
    id,
    template,
  ]),
) as Record<string, DashboardTemplate>;

export const resolveDashboardTemplate = (
  dashboardId: string,
): DashboardTemplate | undefined => DASHBOARD_ID_TO_TEMPLATE[dashboardId];
