import { useEffect, useRef, useState } from "react";
import { Layer } from "@/src/components/ui/layer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { versionUpdateStore } from "./versionUpdateStore";
import { useVersionUpdateAvailable } from "./useVersionUpdateAvailable";
import { VersionUpdateBannerView } from "./VersionUpdateBannerView";

// Hold the banner back until the app has settled after first render. During the
// initial mount/hydration window the layout flickers and React StrictMode
// double-invokes mounts — and because the banner renders through an overlay
// portal, a mount during that churn gets torn down and recreated, replaying the
// entrance animation (a visible "jump"/double-start). Appearing only after the
// app is quiet means the banner mounts exactly once, cleanly. It also reads
// better: no banner flashing in during startup. A build-id mismatch seen later
// (a deploy while the tab is open) still shows immediately — the gate has long
// since opened.
const APP_SETTLE_DELAY_MS = 5000;

/**
 * `false` until {@link APP_SETTLE_DELAY_MS} after mount, then `true`. The timer
 * is the external system this effect owns (setup starts it, cleanup clears it).
 */
function useAppSettled(): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), APP_SETTLE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return settled;
}

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
  // Show only once a build mismatch exists AND the app has settled after first
  // render — the grace period keeps the banner out of the noisy startup window
  // so its entrance plays cleanly (see `useAppSettled`). Both hooks run
  // unconditionally; the gate is the boolean AND of their results.
  const updateAvailable = useVersionUpdateAvailable();
  const appSettled = useAppSettled();
  const isVisible = updateAvailable && appSettled;
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
