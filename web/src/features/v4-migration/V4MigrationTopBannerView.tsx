import { cn } from "@/src/utils/tailwind";
import type {
  V4MigrationTopBannerContent,
  V4MigrationTopBannerPhase,
} from "@/src/features/v4-migration/topBannerContent";

const STRIP_CLASS: Record<V4MigrationTopBannerContent["severity"], string> = {
  warning:
    "border-migration-banner-warning-border bg-migration-banner-warning text-migration-banner-warning-foreground",
  critical:
    "border-migration-banner-critical-border bg-migration-banner-critical text-migration-banner-critical-foreground",
};

const LINK_CLASS: Record<V4MigrationTopBannerContent["severity"], string> = {
  warning:
    "text-migration-banner-warning-link hover:text-migration-banner-warning-link-hover font-bold hover:underline",
  critical:
    "text-migration-banner-critical-link hover:text-migration-banner-critical-link-hover font-bold hover:underline",
};

export type V4MigrationTopBannerViewProps = {
  phase: V4MigrationTopBannerPhase;
  content: V4MigrationTopBannerContent;
  /** Opens the migration panel from the inline “Update” word. */
  onPrimaryClick: () => void;
  /** Fires when the docs word is followed. */
  onSecondaryClick: () => void;
};

/**
 * One-line legacy API shutdown strip for the top-banner stack. Words in the
 * sentence are the actions; there is no separate button and no dismiss.
 */
export function V4MigrationTopBannerView({
  phase,
  content,
  onPrimaryClick,
  onSecondaryClick,
}: V4MigrationTopBannerViewProps) {
  const linkClassName = LINK_CLASS[content.severity];
  const fullText = content.parts
    .map((part) => (typeof part === "string" ? part : part.label))
    .join("");

  return (
    <div
      role="status"
      data-phase={phase}
      className={cn(
        "flex w-full items-center justify-center border-b px-4 py-1",
        STRIP_CLASS[content.severity],
      )}
    >
      <p className="max-w-full min-w-0 truncate text-sm" title={fullText}>
        {content.parts.map((part, index) => {
          if (typeof part === "string") {
            return <span key={index}>{part}</span>;
          }
          if (part.kind === "docs") {
            return (
              <a
                key={index}
                href={part.href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClassName}
                onClick={onSecondaryClick}
              >
                {part.label}
              </a>
            );
          }
          return (
            <button
              key={index}
              type="button"
              className={cn(
                linkClassName,
                "inline cursor-pointer border-0 bg-transparent p-0 align-baseline text-sm",
              )}
              onClick={onPrimaryClick}
            >
              {part.label}
            </button>
          );
        })}
      </p>
    </div>
  );
}
