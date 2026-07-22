import { useEffect, useRef } from "react";
import { Layer } from "@/src/components/ui/layer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { versionUpdateStore } from "./versionUpdateStore";
import { useVersionUpdateAvailable } from "./useVersionUpdateAvailable";
import { VersionUpdateBannerView } from "./VersionUpdateBannerView";

/**
 * App-wide notification prompting the user to reload when a newer build has
 * been deployed while their tab stayed open (LFE-10978, §4.9). Visibility is
 * derived from the version-update store — fed by the tRPC `buildIdLink` on every
 * response — via `useSyncExternalStore`, with no effect-driven state sync.
 *
 * Renders into the top-most overlay layer (`toast`) so it floats above content
 * rather than pushing page chrome down. Analytics: `banner_shown` once per
 * appearance, plus the reload / dismiss actions.
 */
export function VersionUpdateBanner() {
  const isVisible = useVersionUpdateAvailable();
  const capture = usePostHogClientCapture();

  // Analytics side-effect (external system = PostHog): report `banner_shown`
  // once each time the notification appears. Guarded against StrictMode
  // double-mount; reset when it hides so a genuinely new build later counts as
  // a fresh appearance. This does not derive render state — visibility comes
  // from the store — it only reports the appearance.
  const reportedShown = useRef(false);
  useEffect(() => {
    if (isVisible && !reportedShown.current) {
      reportedShown.current = true;
      capture("version_update:banner_shown");
    } else if (!isVisible) {
      reportedShown.current = false;
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
