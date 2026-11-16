import { useEffect, useRef } from "react";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import {
  isV4MigrationTopBannerVisible,
  type V4MigrationTopBannerSeverity,
} from "@/src/features/v4-migration/topBannerContent";
import { useIsForceV3ExperienceSettled } from "@/src/features/v4-migration/useForceV3Experience";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import type { V4MigrationTopBannerViewProps } from "@/src/features/v4-migration/V4MigrationTopBannerView";
import { api } from "@/src/utils/api";

const QUERY_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Account-wide legacy v3 banner for Langfuse Cloud. Returns null when it is
 * hidden. The strip stays up while any accessible project has legacy usage.
 * There is no dismiss.
 */
export function useV4MigrationTopBanner(): V4MigrationTopBannerViewProps | null {
  const capture = usePostHogClientCapture();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { project } = useQueryProjectOrOrganization();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(project?.id);
  const forceV3Settled = useIsForceV3ExperienceSettled(project?.id);
  const enabled = isLangfuseCloud && v4UpgradeUiEnabled && forceV3Settled;

  const accountStateQuery = api.v4Transition.legacyApiBannerState.useQuery(
    undefined,
    {
      enabled,
      refetchOnWindowFocus: false,
      staleTime: QUERY_STALE_TIME_MS,
      throwOnError: false,
      meta: { silentHttpCodes: [401, 403, 404] },
    },
  );
  const state = accountStateQuery.data;
  const actionNeededCount = state?.actionNeededCount ?? 0;
  const severity = state?.severity;
  const visible = isV4MigrationTopBannerVisible({
    severity: enabled ? severity : undefined,
    message: enabled ? state?.message : undefined,
    v4UpgradeUiEnabled,
    isLangfuseCloud,
    actionNeededCount,
    isChecking: state === undefined && !accountStateQuery.isError,
  });
  const bannerSeverity: V4MigrationTopBannerSeverity | null =
    visible && (severity === "warning" || severity === "critical")
      ? severity
      : null;
  // Exposure denominator for the CTA funnel; PostHog is the external system.
  // Fires once per severity the viewer sees, not on every refetch.
  const shownSeverityRef = useRef<V4MigrationTopBannerSeverity | null>(null);
  useEffect(() => {
    if (!bannerSeverity || shownSeverityRef.current === bannerSeverity) return;
    shownSeverityRef.current = bannerSeverity;
    capture("v4_migration:top_banner_shown", {
      severity: bannerSeverity,
      actionNeededCount,
    });
  }, [bannerSeverity, actionNeededCount, capture]);

  if (!bannerSeverity || !state?.message) return null;

  const analytics = {
    severity: bannerSeverity,
    actionNeededCount,
  };

  return {
    severity: bannerSeverity,
    message: state.message,
    onStatusClick: () => {
      capture("v4_migration:top_banner_cta_clicked", {
        ...analytics,
        cta: "primary",
      });
    },
  };
}
