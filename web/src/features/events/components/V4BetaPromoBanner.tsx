import { useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { ZapIcon, X, ExternalLink } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/src/components/ui/button";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  useTopBanner,
  useTopBannerRegistration,
} from "@/src/features/top-banner";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { V4BetaIntroDialog } from "@/src/features/events/components/V4BetaIntroDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

const CHANGELOG_URL =
  "https://langfuse.com/changelog/2026-03-10-simplify-for-scale";
const DISMISSED_STORAGE_KEY = "v4-beta-promo-banner:v1:dismissed";
const V4_BETA_PROMO_BANNER_ID = "v4-beta-promo-banner";
const V4_BETA_PROMO_BANNER_ORDER = 25;

const PAGE_MESSAGES: Record<string, string> = {
  "/project/[projectId]": "Faster dashboards available.",
  "/project/[projectId]/dashboards": "Faster dashboards available.",
  "/project/[projectId]/dashboards/[dashboardId]":
    "Faster dashboards available.",
  "/project/[projectId]/traces": "Faster trace UI available.",
  "/project/[projectId]/traces/[traceId]": "Faster trace UI available.",
};

export function V4BetaPromoBanner() {
  const router = useRouter();
  const session = useSession();
  const {
    isBetaEnabled,
    enableWithIntro,
    showIntroDialog,
    confirmIntroDialog,
    isLoading,
  } = useV4Beta();
  const capture = usePostHogClientCapture();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { getTopBannerOffset } = useTopBanner();
  const [isDismissed, setIsDismissed] = useLocalStorage<boolean>(
    DISMISSED_STORAGE_KEY,
    false,
  );
  const bannerRef = useRef<HTMLDivElement>(null);

  const isAuthenticated = session.status === "authenticated";
  const enableExperimentalFeatures =
    session.data?.environment?.enableExperimentalFeatures ?? false;

  // Match the v4BetaToggleVisible logic from navigationFilters.ts
  // cloudAdmin = isLangfuseCloud && isAdmin (already covered by isLangfuseCloud)
  const isToggleVisible = isLangfuseCloud || enableExperimentalFeatures;
  const pageMessage = PAGE_MESSAGES[router.pathname];

  const isVisible =
    isAuthenticated &&
    !isBetaEnabled &&
    !isDismissed &&
    isToggleVisible &&
    !!pageMessage;

  const topOffset = getTopBannerOffset(V4_BETA_PROMO_BANNER_ORDER);

  useTopBannerRegistration({
    bannerId: V4_BETA_PROMO_BANNER_ID,
    order: V4_BETA_PROMO_BANNER_ORDER,
    isVisible,
    elementRef: bannerRef,
  });

  if (!isVisible) {
    return (
      <V4BetaIntroDialog
        open={showIntroDialog}
        onConfirm={confirmIntroDialog}
      />
    );
  }

  return (
    <div
      ref={bannerRef}
      className="bg-light-blue text-foreground fixed right-0 left-0 z-50 border-b"
      style={{ top: `${topOffset}px` }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 py-1.5 pl-3">
        <ZapIcon className="h-4 w-4 shrink-0" />
        <p className="flex flex-1 flex-row gap-1 text-sm">
          <span className="font-semibold">{pageMessage}</span> Enable the{" "}
          <button
            className="inline cursor-pointer font-semibold underline underline-offset-2"
            onClick={() => {
              enableWithIntro({
                onSuccess: () => {
                  capture("sidebar:v4_beta_toggled", { enabled: true });
                },
              });
            }}
            disabled={isLoading}
          >
            Fast (Preview)
          </button>{" "}
          toggle for a more performant experience.{" "}
          <Link
            href={CHANGELOG_URL}
            target="_blank"
            className="flex flex-row items-center gap-1 underline underline-offset-2"
          >
            Learn more
            <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setIsDismissed(true)}
          aria-label="Dismiss banner"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <V4BetaIntroDialog
        open={showIntroDialog}
        onConfirm={confirmIntroDialog}
      />
    </div>
  );
}
