import { useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  useTopBanner,
  useTopBannerRegistration,
} from "@/src/features/top-banner";
import { env } from "@/src/env.mjs";

const PREVIEW_BANNER_ID = "preview-deployment-banner";
const PREVIEW_BANNER_ORDER = 20;

/**
 * Top-of-page strip shown on PR preview deployments only. The env vars are
 * baked into preview web images by .github/workflows/preview-build.yml; they
 * are unset everywhere else, so the banner never renders outside previews.
 */
export function PreviewDeploymentBanner() {
  const bannerRef = useRef<HTMLDivElement>(null);
  const { getTopBannerOffset } = useTopBanner();

  const prUrl = env.NEXT_PUBLIC_PREVIEW_PR_URL;

  useTopBannerRegistration({
    bannerId: PREVIEW_BANNER_ID,
    order: PREVIEW_BANNER_ORDER,
    isVisible: Boolean(prUrl),
    elementRef: bannerRef,
  });

  if (!prUrl) {
    return null;
  }

  const prNumber = /\/pull\/(\d+)/.exec(prUrl)?.[1];
  const author = env.NEXT_PUBLIC_PREVIEW_PR_AUTHOR;
  const lastUpdated = env.NEXT_PUBLIC_PREVIEW_LAST_UPDATED
    ? new Date(env.NEXT_PUBLIC_PREVIEW_LAST_UPDATED)
    : undefined;
  const updatedText =
    lastUpdated && !Number.isNaN(lastUpdated.getTime())
      ? formatDistanceToNow(lastUpdated, { addSuffix: true })
      : undefined;

  return (
    <div
      ref={bannerRef}
      className="fixed z-51 flex w-full items-center justify-center gap-4 border-b border-violet-200 bg-violet-100 px-4 py-1 text-violet-950 dark:border-violet-300/15 dark:bg-violet-500/10 dark:text-violet-200"
      style={{ top: getTopBannerOffset(PREVIEW_BANNER_ORDER) }}
    >
      <div className="flex items-center gap-3 text-sm">
        <span>
          Preview deployment of{" "}
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link hover:text-link-hover font-bold"
          >
            {prNumber ? `PR #${prNumber}` : "a pull request"}
          </a>
          {author ? (
            <>
              {" "}
              by{" "}
              <a
                href={`https://github.com/${encodeURIComponent(author)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link hover:text-link-hover font-bold"
              >
                @{author}
              </a>
            </>
          ) : null}
          {updatedText ? <> · updated {updatedText}</> : null}
        </span>
      </div>
    </div>
  );
}
