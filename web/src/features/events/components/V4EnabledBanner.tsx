import { useEffect, useRef } from "react";
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

const CHANGELOG_URL =
  "https://langfuse.com/changelog/2026-03-10-simplify-for-scale";
const DISMISSED_STORAGE_KEY = "v4-beta-enabled-banner:v1:dismissed";
const V4_BETA_BANNER_ID = "v4-beta-enabled-banner";
const V4_BETA_BANNER_ORDER = 20;

export function V4EnabledBanner() {
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
      className="bg-light-blue text-foreground fixed right-0 left-0 z-50 border-b"
      style={{ top: `${topOffset}px` }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 py-1.5 pl-3">
        <ZapIcon className="h-4 w-4 shrink-0" />
        <p className="flex flex-1 flex-row gap-1 text-sm">
          <span className="font-semibold">
            Faster Langfuse experience enabled (preview).
          </span>{" "}
          Missing real-time data? Upgrade your Langfuse SDK to the latest major
          version.{" "}
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
          onClick={dismissBanner}
          aria-label="Dismiss Preview (fast) banner"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
