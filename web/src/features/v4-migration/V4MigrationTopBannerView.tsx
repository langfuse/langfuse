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

const MEMBER_HINT = "Ask an admin to update.";

export type V4MigrationTopBannerViewProps = {
  severity: V4MigrationTopBannerSeverity;
  /** Plain text, with `{projects}` already replaced. */
  message: string;
  /** Owners and admins get the Update link. Members get the hint instead. */
  showUpdate: boolean;
  /** Opens the migration panel from the inline “Update” word. */
  onUpdateClick: () => void;
};

/**
 * One-line legacy v3 strip for the top-banner stack. The message comes from
 * env; the only action is the inline Update word. There is no dismiss.
 */
export function V4MigrationTopBannerView({
  severity,
  message,
  showUpdate,
  onUpdateClick,
}: V4MigrationTopBannerViewProps) {
  const linkClassName = LINK_CLASS[severity];
  const fullText = showUpdate
    ? `${message} Update`
    : `${message} ${MEMBER_HINT}`;

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
        {showUpdate ? (
          <button
            type="button"
            className={cn(
              linkClassName,
              "inline cursor-pointer border-0 bg-transparent p-0 align-baseline text-sm",
            )}
            onClick={onUpdateClick}
          >
            Update
          </button>
        ) : (
          <span>{MEMBER_HINT}</span>
        )}
      </p>
    </div>
  );
}
