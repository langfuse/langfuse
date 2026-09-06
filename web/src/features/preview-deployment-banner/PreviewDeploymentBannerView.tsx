import { type Ref } from "react";
import { useTranslations } from "next-intl";

export type PreviewDeploymentBannerViewProps = {
  /** Link back to the pull request this preview deployment belongs to. */
  prUrl: string;
  /** PR number for the link label; falls back to a generic label when absent. */
  prNumber?: string;
  /** GitHub login of the PR author. */
  author?: string;
  /** Human-readable relative time the preview was last updated, e.g. "2 hours ago". */
  updatedText?: string;
  /** Absolute timestamp shown on hover — the relative text is computed at render
   * time and goes stale in a long-lived tab. */
  updatedTitle?: string;
  /** Vertical offset when stacked below other top banners. */
  topOffset?: number;
  ref?: Ref<HTMLDivElement>;
};

export function PreviewDeploymentBannerView({
  prUrl,
  prNumber,
  author,
  updatedText,
  updatedTitle,
  topOffset = 0,
  ref,
}: PreviewDeploymentBannerViewProps) {
  const t = useTranslations("systemUi.previewDeployment");
  return (
    <div
      ref={ref}
      className="border-preview-banner-border bg-preview-banner text-preview-banner-foreground fixed z-51 flex w-full items-center justify-center border-b px-4 py-1"
      style={{ top: topOffset }}
    >
      <span className="text-sm">
        {t("deploymentOf")}{" "}
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-preview-banner-link hover:text-preview-banner-link-hover font-bold hover:underline"
        >
          {prNumber
            ? t("pullRequest", { number: prNumber })
            : t("genericPullRequest")}
        </a>
        {author ? (
          <>
            {" "}
            {t("by")}{" "}
            <a
              href={`https://github.com/${encodeURIComponent(author)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-preview-banner-link hover:text-preview-banner-link-hover font-bold hover:underline"
            >
              @{author}
            </a>
          </>
        ) : null}
        {updatedText ? (
          <>
            {" "}
            ·{" "}
            <span title={updatedTitle}>
              {t("updated", { time: updatedText })}
            </span>
          </>
        ) : null}
      </span>
    </div>
  );
}
