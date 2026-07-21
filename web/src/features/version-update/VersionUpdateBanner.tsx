import { useRef } from "react";
import {
  useTopBanner,
  useTopBannerRegistration,
} from "@/src/features/top-banner";
import { versionUpdateStore } from "./versionUpdateStore";
import { useVersionUpdateAvailable } from "./useVersionUpdateAvailable";
import { VersionUpdateBannerView } from "./VersionUpdateBannerView";

const VERSION_UPDATE_BANNER_ID = "version-update-banner";
// After the payment banner (order 10) so the two stack cleanly if both show.
const VERSION_UPDATE_BANNER_ORDER = 20;

/**
 * App-wide banner prompting the user to reload when a newer build has been
 * deployed while their tab stayed open (LFE-10978, §4.9). Visibility is derived
 * from the version-update store — fed by the tRPC `buildIdLink` on every
 * response — via `useSyncExternalStore`, with no effect-driven state sync.
 *
 * Participates in the shared top-banner offset system so page chrome shifts
 * down instead of being overlapped, and offsets below any earlier banner.
 */
export function VersionUpdateBanner() {
  const isVisible = useVersionUpdateAvailable();
  const bannerRef = useRef<HTMLDivElement>(null);
  const { getTopBannerOffset } = useTopBanner();

  useTopBannerRegistration({
    bannerId: VERSION_UPDATE_BANNER_ID,
    order: VERSION_UPDATE_BANNER_ORDER,
    isVisible,
    elementRef: bannerRef,
  });

  if (!isVisible) return null;

  return (
    <VersionUpdateBannerView
      ref={bannerRef}
      style={{ top: getTopBannerOffset(VERSION_UPDATE_BANNER_ORDER) }}
      onReload={() => window.location.reload()}
      onDismiss={() => versionUpdateStore.dismiss()}
    />
  );
}
