import { env } from "@/src/env.mjs";

type V4BannerSeverity = "off" | "warning" | "critical";

export type LegacyApiBannerState = {
  severity: V4BannerSeverity;
  /** Plain text shown in the strip. Null when the banner is off. */
  message: string | null;
  exempt: boolean;
};

/**
 * getLegacyApiBannerState reads the banner from env. Self-hosted deployments,
 * exempt orgs, severity "off", and an empty message all hide it. The org-wide
 * legacy-usage check stays on the client.
 */
export function getLegacyApiBannerState(params: {
  orgId: string;
  isLangfuseCloud: boolean;
}): LegacyApiBannerState {
  const { orgId, isLangfuseCloud } = params;
  const exempt = env.LANGFUSE_V4_BANNER_EXEMPT_ORG_IDS.includes(orgId);
  const message = env.LANGFUSE_V4_BANNER_MESSAGE?.trim() || null;
  const severity = env.LANGFUSE_V4_BANNER_SEVERITY;
  const hidden =
    !isLangfuseCloud || exempt || severity === "off" || message === null;

  return {
    severity: hidden ? "off" : severity,
    message: hidden ? null : message,
    exempt,
  };
}
