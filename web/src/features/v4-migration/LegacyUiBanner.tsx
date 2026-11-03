import { V4IntroDialog } from "@/src/features/events/components/V4IntroDialog";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { useV4PreviewToggle } from "@/src/features/events/hooks/useV4PreviewToggle";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { LegacyUiBannerView } from "@/src/features/v4-migration/LegacyUiBannerView";
import { useForceV3Experience } from "@/src/features/v4-migration/useForceV3Experience";
import { useHasV4MigrationDeadline } from "@/src/features/v4-migration/V4MigrationContent";

/**
 * Whether the legacy-UI migration strip should render. Opted-out users
 * (`isV3Legacy`) see it on every page; force-v3 projects never do.
 */
export function useLegacyUiBannerVisible(projectId?: string): boolean {
  const { isV3Legacy, isResolved } = useReadPath();
  const forceV3 = useForceV3Experience(projectId);
  return isResolved && isV3Legacy && !forceV3;
}

/**
 * Top-of-app strip for users who disabled the v4 UI. Parent gates with
 * `useLegacyUiBannerVisible`. Primary CTA runs the same enable path as the
 * sidebar / migration-page toggle so the banner disappears as soon as the
 * session flips to v4.
 */
export function LegacyUiBanner() {
  const hasDeadline = useHasV4MigrationDeadline();
  const capture = usePostHogClientCapture();
  const {
    isLoading,
    handleToggle,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
  } = useV4PreviewToggle("legacy_ui_banner");

  return (
    <>
      <LegacyUiBannerView
        hasDeadline={hasDeadline}
        isSwitching={isLoading}
        onSwitchToLatestUi={() => handleToggle(true)}
        onMigrationStatusClick={() =>
          capture("v4_migration:legacy_ui_banner_status_clicked")
        }
      />
      <V4IntroDialog
        open={showIntroDialog}
        onConfirm={confirmIntroDialog}
        onDismiss={dismissIntroDialog}
      />
    </>
  );
}
