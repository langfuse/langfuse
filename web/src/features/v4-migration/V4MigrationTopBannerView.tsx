import Link from "next/link";
import { TriangleAlert } from "@langfuse/icons";
import { cn } from "@/src/utils/tailwind";
import type { V4MigrationTopBannerSeverity } from "@/src/features/v4-migration/topBannerContent";
import {
  V4_MIGRATION_STATUS_HREF,
  V4_MIGRATION_STATUS_LINK_LABEL,
  V4_MIGRATION_STATUS_MOBILE_LABEL,
} from "@/src/features/v4-migration/v4MigrationBannerCopy";

const STRIP_CLASS: Record<V4MigrationTopBannerSeverity, string> = {
  warning:
    "border-customer-data-banner-border bg-customer-data-banner text-customer-data-banner-foreground",
  critical: "border-current/15 bg-red-700 text-white",
};

const LINK_CLASS =
  "shrink-0 text-sm font-bold underline decoration-current/50 underline-offset-2 hover:decoration-current";

export type V4MigrationTopBannerViewProps = {
  severity: V4MigrationTopBannerSeverity;
  /** Plain text shown before the status link. */
  message: string;
  /** In-app path or absolute status-page URL. */
  href?: string;
  linkLabel?: string;
  /** Shown below the `sm` breakpoint, where the full sentence is hidden. */
  mobileLabel?: string;
  /** Records clicks on the status link. */
  onStatusClick: () => void;
};

/**
 * One-line legacy v3 strip for the top-banner stack. The status link is
 * available to every role. There is no dismiss. The strip links to the
 * migration page.
 */
export function V4MigrationTopBannerView({
  severity,
  message,
  href = V4_MIGRATION_STATUS_HREF,
  linkLabel = V4_MIGRATION_STATUS_LINK_LABEL,
  mobileLabel = V4_MIGRATION_STATUS_MOBILE_LABEL,
  onStatusClick,
}: V4MigrationTopBannerViewProps) {
  const fullText = `${message} ${linkLabel}`;
  const external = href.startsWith("http");

  return (
    <div
      role="status"
      data-severity={severity}
      title={fullText}
      className={cn(
        "flex w-full items-center justify-center gap-1.5 border-b px-4 py-1",
        STRIP_CLASS[severity],
      )}
    >
      <TriangleAlert size="sm" __rawClassName="shrink-0" aria-hidden="true" />
      <span
        className="hidden min-w-0 truncate text-sm sm:inline"
        title={message}
      >
        {message}{" "}
      </span>
      <span className="text-sm sm:hidden">{mobileLabel}</span>
      {external ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
          onClick={onStatusClick}
        >
          {linkLabel}
        </a>
      ) : (
        <Link href={href} className={LINK_CLASS} onClick={onStatusClick}>
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
