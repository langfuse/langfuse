import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { V4MigrationStatusDot } from "@/src/features/v4-migration/V4MigrationStatusDot";

type V4MigrationBadgeContentProps = {
  onClick: () => void;
  // Discoverability callbacks: the pill expands its description on hover AND
  // on keyboard focus (group-focus-visible), so either counts as "noticed
  // the badge". Wired to mouseenter/mouseleave and focus/blur alike.
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  title: string;
  description?: string;
  showChevron?: boolean;
  compact?: boolean;
};

export function V4MigrationBadgeContent({
  onClick,
  onHoverStart,
  onHoverEnd,
  title,
  description,
  showChevron = true,
  compact = false,
}: V4MigrationBadgeContentProps) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        onFocus={onHoverStart}
        onBlur={onHoverEnd}
        className="hover:bg-muted/50 hover:text-foreground inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold whitespace-nowrap"
      >
        <span
          aria-hidden
          className="size-1.75 shrink-0 rounded-full bg-orange-400 dark:bg-orange-400"
        />
        {title}
      </button>
    );
  }

  return (
    <span className="inline-grid flex-none shrink-0">
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1 inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-bold whitespace-nowrap"
      >
        <span className="size-1.75 shrink-0 rounded-full" />
        <span className="flex items-center">
          {title}
          {description ? <>&nbsp;{description}.</> : null}
          {showChevron ? (
            <span className="ml-1 flex">
              <DropdownIndicator direction="right" size="sm" nudge />
            </span>
          ) : null}
        </span>
      </span>

      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        onFocus={onHoverStart}
        onBlur={onHoverEnd}
        className="group ring-input hover:bg-muted/50 hover:text-foreground col-start-1 row-start-1 inline-flex w-fit flex-none shrink-0 items-center gap-1.5 justify-self-start rounded-full bg-transparent px-2 py-0.5 text-xs font-bold whitespace-nowrap ring"
      >
        <V4MigrationStatusDot variant="action" />
        <span className="flex items-center">
          {title}
          {description ? (
            // 0fr -> 1fr animates to the intrinsic text width; a max-width cap
            // would clip any description longer than the magic number (LF-90).
            // The 300ms duration is load-bearing for analytics: HOVER_DWELL_MS
            // in V4MigrationDelayBadge assumes the description finishes
            // expanding before the dwell elapses. Keep dwell > duration.
            <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-out group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr]">
              <span className="min-w-0 overflow-hidden">
                <span className="whitespace-nowrap">.&nbsp;{description}.</span>
              </span>
            </span>
          ) : null}
          {showChevron ? (
            <span className="ml-1 flex">
              <DropdownIndicator direction="right" size="sm" nudge />
            </span>
          ) : null}
        </span>
      </button>
    </span>
  );
}
