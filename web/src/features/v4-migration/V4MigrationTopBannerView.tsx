import Link from "next/link";
import { cn } from "@/src/utils/tailwind";
import type { V4MigrationTopBannerSeverity } from "@/src/features/v4-migration/topBannerContent";

const STRIP_CLASS: Record<V4MigrationTopBannerSeverity, string> = {
  warning:
    "border-migration-banner-warning-border bg-migration-banner-warning text-migration-banner-warning-foreground",
  critical:
    "border-migration-banner-critical-border bg-migration-banner-critical text-migration-banner-critical-foreground",
};

const LINK_CLASS: Record<V4MigrationTopBannerSeverity, string> = {
  warning:
    "text-migration-banner-warning-link hover:text-migration-banner-warning-link-hover font-bold hover:underline",
  critical:
    "text-migration-banner-critical-link hover:text-migration-banner-critical-link-hover font-bold hover:underline",
};

export type V4MigrationTopBannerViewProps = {
  severity: V4MigrationTopBannerSeverity;
  /** Plain text configured by the operator. */
  message: string;
  /** Records clicks on the migration status link. */
  onStatusClick: () => void;
};

/**
 * One-line legacy v3 strip for the top-banner stack. The message comes from
 * env; the status link is available to every role. There is no dismiss.
 */
export function V4MigrationTopBannerView({
  severity,
  message,
  onStatusClick,
}: V4MigrationTopBannerViewProps) {
  const linkClassName = LINK_CLASS[severity];
  const fullText = `${message} Check migration status`;

  return (
    <div
      role="status"
      data-severity={severity}
      className={cn(
        "flex w-full items-center justify-center border-b px-4 py-1",
        STRIP_CLASS[severity],
      )}
    >
      <p className="max-w-full min-w-0 truncate text-sm" title={fullText}>
        <span>{message} </span>
        <Link
          href="/v4-migration"
          className={linkClassName}
          onClick={onStatusClick}
        >
          Check migration status
        </Link>
      </p>
    </div>
  );
}
