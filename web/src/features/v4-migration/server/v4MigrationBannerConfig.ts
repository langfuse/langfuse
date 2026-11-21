import { env } from "@/src/env.mjs";
import { V4_MIGRATION_TOP_BANNER_MESSAGE } from "@/src/features/v4-migration/v4MigrationBannerCopy";

type V4BannerSeverity = "off" | "warning" | "critical";

export type V4MigrationBannerConfig = {
  severity: V4BannerSeverity;
  /** Plain text shown in the strip. Null when the banner is off. */
  message: string | null;
};

/**
 * Self-hosted deployments and severity "off" hide the banner. A non-null
 * message means the strip is allowed. The sentence itself comes from the
 * deadline rule. Operators choose the severity, which projects keep a
 * December 31 deadline, and which projects skip the v3 cutoff.
 */
export function getV4MigrationBannerConfig(params: {
  isLangfuseCloud: boolean;
}): V4MigrationBannerConfig {
  const { isLangfuseCloud } = params;
  const severity = env.LANGFUSE_V4_BANNER_SEVERITY;
  const hidden = !isLangfuseCloud || severity === "off";

  return {
    severity: hidden ? "off" : severity,
    message: hidden ? null : V4_MIGRATION_TOP_BANNER_MESSAGE,
  };
}
