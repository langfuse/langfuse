import { useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  useTopBanner,
  useTopBannerRegistration,
} from "@/src/features/top-banner";
import { env } from "@/src/env.mjs";
import { PreviewDeploymentBannerView } from "./PreviewDeploymentBannerView";

const PREVIEW_BANNER_ID = "preview-deployment-banner";
const PREVIEW_BANNER_ORDER = 20;

/**
 * Top-of-page strip shown on PR preview deployments only. The env vars are
 * baked into preview web images by .github/workflows/preview-build.yml; they
 * are unset everywhere else, so the banner never renders outside previews.
 */
export function PreviewDeploymentBanner({ prUrl }: { prUrl: string }) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const { getTopBannerOffset } = useTopBanner();

  useTopBannerRegistration({
    bannerId: PREVIEW_BANNER_ID,
    order: PREVIEW_BANNER_ORDER,
    isVisible: true,
    elementRef: bannerRef,
  });

  const parsed = env.NEXT_PUBLIC_PREVIEW_LAST_UPDATED
    ? new Date(env.NEXT_PUBLIC_PREVIEW_LAST_UPDATED)
    : undefined;
  const lastUpdated =
    parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;

  return (
    <PreviewDeploymentBannerView
      ref={bannerRef}
      prUrl={prUrl}
      prNumber={/\/pull\/(\d+)/.exec(prUrl)?.[1]}
      author={env.NEXT_PUBLIC_PREVIEW_PR_AUTHOR}
      updatedText={
        lastUpdated
          ? formatDistanceToNow(lastUpdated, { addSuffix: true })
          : undefined
      }
      updatedTitle={lastUpdated?.toLocaleString()}
      topOffset={getTopBannerOffset(PREVIEW_BANNER_ORDER)}
    />
  );
}
