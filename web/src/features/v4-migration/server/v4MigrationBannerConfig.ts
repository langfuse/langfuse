import { env } from "@/src/env.mjs";
import { V4_MIGRATION_TOP_BANNER_MESSAGE } from "@/src/features/v4-migration/v4MigrationBannerCopy";

type V4BannerSeverity = "off" | "warning" | "critical";

export type V4MigrationBannerConfig = {
  severity: V4BannerSeverity;
  /** Plain text shown in the strip. Null when the banner is off. */
  message: string | null;
  exempt: boolean;
};

/**
 * Self-hosted deployments, exempt orgs, and severity "off" hide the banner.
 * The deadline sentence is fixed in code. Operators choose when to show it,
 * whether its severity is warning or critical, which projects are in today's
 * brownout, and which organizations keep the one-week extension.
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
