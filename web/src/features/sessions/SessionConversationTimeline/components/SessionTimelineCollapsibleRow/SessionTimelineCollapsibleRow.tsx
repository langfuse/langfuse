import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export function SessionTimelineCollapsibleRow({
  label,
  labelActionName,
  icon,
  isExpanded,
  onExpandedChange,
  onOpenObservation,
  trailingContent,
  children,
}: {
  label: string;
  labelActionName?: string;
  icon?: ReactNode;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  onOpenObservation?: () => void;
  trailingContent?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex w-full scroll-mt-16 flex-col py-1",
        isExpanded && "gap-2",
      )}
      data-expanded={isExpanded}
    >
      <div
        className="group/collapsible-row flex w-full min-w-0 items-center gap-0.5"
        data-expanded={isExpanded}
      >
        <button
          type="button"
          onClick={onOpenObservation ?? (() => onExpandedChange(!isExpanded))}
          className="flex min-w-0 items-center gap-2 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-expanded={onOpenObservation ? undefined : isExpanded}
          aria-label={labelActionName}
        >
          {icon && (
            <span className="bg-background relative z-[1] flex shrink-0 rounded-full">
              {icon}
            </span>
          )}
          <span
            className="min-w-0 truncate text-xs font-normal hover:underline"
            title={label}
          >
            {label}
          </span>
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 rounded-sm p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${label}`}
          onClick={() => onExpandedChange(!isExpanded)}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              !isExpanded && "-rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
        <div
          className="border-border invisible mx-3 min-w-0 flex-1 border-t border-dashed group-focus-within/collapsible-row:visible group-hover/collapsible-row:visible"
          aria-hidden="true"
        />
        <span className="flex shrink-0 items-center gap-2">
          {trailingContent}
        </span>
      </div>
      {isExpanded && <div className="min-w-0">{children}</div>}
    </section>
  );
}
