import { useRef } from "react";
import { ExternalLink, GitPullRequest } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/src/components/ui/button";
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
      className="bg-foreground text-background fixed z-51 flex w-full items-center justify-between gap-4 px-4 py-1"
      style={{ top: getTopBannerOffset(PREVIEW_BANNER_ORDER) }}
    >
      <div className="flex items-center gap-3 text-sm">
        <GitPullRequest className="h-4 w-4 shrink-0" />
        <span>
          Preview deployment of{" "}
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline underline-offset-2"
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
                className="font-bold underline underline-offset-2"
              >
                @{author}
              </a>
            </>
          ) : null}
          {updatedText ? <> · updated {updatedText}</> : null}
        </span>
      </div>

      <Button size="sm" variant="ghost" asChild>
        <a href={prUrl} target="_blank" rel="noopener noreferrer">
          Open PR
          <ExternalLink className="ml-2 h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}
