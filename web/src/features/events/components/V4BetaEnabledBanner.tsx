import { useEffect, useRef } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/src/components/ui/button";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  useTopBanner,
  useTopBannerRegistration,
} from "@/src/features/top-banner";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

const CHANGELOG_URL = "https://langfuse.com/changelog"; // TODO: update after changelog release
const DISMISSED_STORAGE_KEY = "v4-beta-enabled-banner:v1:dismissed";
const V4_BETA_BANNER_ID = "v4-beta-enabled-banner";
const V4_BETA_BANNER_ORDER = 20;

export function V4BetaEnabledBanner() {
  const session = useSession();
  const { isBetaEnabled } = useV4Beta();
  const { getTopBannerOffset } = useTopBanner();
  const [isDismissed, setIsDismissed] = useLocalStorage<boolean>(
    DISMISSED_STORAGE_KEY,
    false,
  );
  const bannerRef = useRef<HTMLDivElement>(null);

  const isAuthenticated = session.status === "authenticated";
  const isVisible = isAuthenticated && isBetaEnabled && !isDismissed;
  const topOffset = getTopBannerOffset(V4_BETA_BANNER_ORDER);

  useEffect(() => {
    if (!isAuthenticated || isBetaEnabled || !isDismissed) {
      return;
    }

    setIsDismissed(false);
  }, [isAuthenticated, isBetaEnabled, isDismissed, setIsDismissed]);

  useTopBannerRegistration({
    bannerId: V4_BETA_BANNER_ID,
    order: V4_BETA_BANNER_ORDER,
    isVisible,
    elementRef: bannerRef,
  });

  if (!isVisible) {
    return null;
  }

  const dismissBanner = () => {
    setIsDismissed(true);
  };

  return (
    <div
      ref={bannerRef}
      className="fixed left-0 right-0 z-50 border-b bg-light-blue text-foreground"
      style={{ top: `${topOffset}px` }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-4 py-1.5">
        <Sparkles className="h-4 w-4 shrink-0" />
        <p className="flex-1 text-sm">
          <span className="font-semibold">v4 Beta is enabled.</span> You&apos;re
          using Langfuse&apos;s new observation-centric architecture for faster
          charts and APIs.{" "}
          <Link
            href={CHANGELOG_URL}
            target="_blank"
            className="font-medium underline underline-offset-2"
          >
            Read the blog post
          </Link>
          .
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={dismissBanner}
          aria-label="Dismiss v4 beta banner"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
