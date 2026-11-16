import { env } from "@/src/env.mjs";

type V4BannerSeverity = "off" | "warning" | "critical";

const V4_MIGRATION_TOP_BANNER_MESSAGE =
  "Action required: After November 16, 2026, some features may stop working for at least one of your projects.";

export type V4MigrationBannerConfig = {
  severity: V4BannerSeverity;
  /** Plain text shown in the strip. Null when the banner is off. */
  message: string | null;
  exempt: boolean;
};

/**
 * Self-hosted deployments, exempt orgs, and severity "off" hide the banner.
 * The temporary migration sentence is fixed in code; operators only choose
 * when to show it and whether its severity is warning or critical.
 */
export function getV4MigrationBannerConfig(params: {
  orgId: string;
  isLangfuseCloud: boolean;
}): V4MigrationBannerConfig {
  const { orgId, isLangfuseCloud } = params;
  const exempt = env.LANGFUSE_V4_BANNER_EXEMPT_ORG_IDS.includes(orgId);
  const severity = env.LANGFUSE_V4_BANNER_SEVERITY;
  const hidden = !isLangfuseCloud || exempt || severity === "off";

  return {
    severity: hidden ? "off" : severity,
    message: hidden ? null : V4_MIGRATION_TOP_BANNER_MESSAGE,
    exempt,
  };
}
