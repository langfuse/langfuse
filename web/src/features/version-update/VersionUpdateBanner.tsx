import { useEffect } from "react";
import { Layer } from "@/src/components/ui/layer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { versionUpdateStore } from "./versionUpdateStore";
import { useVersionUpdateAvailable } from "./useVersionUpdateAvailable";
import { useAppSettled } from "./useAppSettled";
import { VersionUpdateBannerView } from "./VersionUpdateBannerView";

/**
 * App-wide notification prompting the user to reload when a newer build has
 * been deployed while their tab stayed open (LFE-10978, §4.9).
 *
 * Visibility is `updateAvailable && appSettled` — both read from module-level
 * external stores via `useSyncExternalStore` (no effect-driven state sync).
 * `updateAvailable` comes from {@link versionUpdateStore} (fed by the tRPC
 * `buildIdLink`); {@link useAppSettled} holds the banner out of the noisy
 * startup window. Keeping both in module scope means the state survives banner
 * remounts (e.g. AppLayout switching between AuthenticatedLayout and
 * MinimalLayout) rather than re-hiding for the grace period each time.
 *
 * Renders into the top-most overlay layer (`toast`) so it floats above content
 * rather than pushing page chrome down. Analytics: `banner_shown` once per
 * appearance, plus the reload / dismiss actions.
 */
export function VersionUpdateBanner() {
  const updateAvailable = useVersionUpdateAvailable();
  const appSettled = useAppSettled();
  const isVisible = updateAvailable && appSettled;
  const capture = usePostHogClientCapture();

  // Analytics side-effect (external system = PostHog): report `banner_shown`
  // once per appearance. The once-guard lives in the store, so a banner remount
  // cannot double-count one continuous appearance and a StrictMode-double-
  // invoked effect still fires the event only once.
  useEffect(() => {
    if (isVisible && versionUpdateStore.markShownReported()) {
      capture("version_update:banner_shown");
    }
  }, [isVisible, capture]);

  if (!isVisible) return null;

  return (
    <Layer name="toast">
      <VersionUpdateBannerView
        onReload={() => {
          capture("version_update:reload_clicked");
          window.location.reload();
        }}
        onDismiss={() => {
          capture("version_update:dismissed");
          versionUpdateStore.dismiss();
        }}
      />
    </Layer>
  );
}
