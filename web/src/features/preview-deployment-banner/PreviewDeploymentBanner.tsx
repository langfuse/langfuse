import { formatDistanceToNow } from "date-fns";
import { env } from "@/src/env.mjs";
import { PreviewDeploymentBannerView } from "./PreviewDeploymentBannerView";

/**
 * Top-of-page strip shown on PR preview deployments only. The env vars are
 * baked into preview web images by .github/workflows/preview-build.yml; they
 * are unset everywhere else, so the banner never renders outside previews.
 */
export function PreviewDeploymentBanner({ prUrl }: { prUrl: string }) {
  const parsed = env.NEXT_PUBLIC_PREVIEW_LAST_UPDATED
    ? new Date(env.NEXT_PUBLIC_PREVIEW_LAST_UPDATED)
    : undefined;
  const lastUpdated =
    parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;

  return (
    <PreviewDeploymentBannerView
      prUrl={prUrl}
      prNumber={/\/pull\/(\d+)/.exec(prUrl)?.[1]}
      author={env.NEXT_PUBLIC_PREVIEW_PR_AUTHOR}
      updatedText={
        lastUpdated
          ? formatDistanceToNow(lastUpdated, { addSuffix: true })
          : undefined
      }
      updatedTitle={lastUpdated?.toLocaleString()}
    />
  );
}
