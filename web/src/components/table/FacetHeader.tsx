import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

type FacetHeaderProps = Pick<
  ComponentPropsWithoutRef<"button">,
  | "id"
  | "type"
  | "onClick"
  | "onKeyDown"
  | "onPointerDown"
  | "tabIndex"
  | "disabled"
  | "aria-expanded"
  | "aria-controls"
> & {
  label: string;
  children: ReactNode;
  summary: string | null | undefined;
  summaryIcon: ReactNode;
  isActive: boolean;
  isDisabled: boolean;
  onReset: (() => void) | undefined;
};

export const FacetHeader = forwardRef<HTMLButtonElement, FacetHeaderProps>(
  function FacetHeader(
    {
      label,
      children,
      summary,
      summaryIcon,
      isActive,
      isDisabled,
      onReset,
      ...buttonProps
    },
    ref,
  ) {
    return (
      <button
        {...buttonProps}
        ref={ref}
        className={cn(
          // Reserve the Clear control's height before a selection is active.
          "group/facet text-foreground-secondary hover:bg-accent aria-expanded:bg-muted relative flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-bold transition-colors [&[aria-expanded=true]>svg:first-child]:rotate-90",
          isDisabled &&
            "text-muted-foreground/60 hover:text-muted-foreground/60 cursor-not-allowed hover:bg-transparent aria-expanded:bg-transparent",
        )}
      >
        <DropdownIndicator direction="right" nudge />
        <div className="flex min-w-0 grow items-center gap-1.5">
          {children}
          {summary && (
            <span
              className={cn(
                "ml-auto h-4 max-w-1/2 min-w-0 shrink-0 truncate text-[11px] leading-4 group-aria-expanded/facet:hidden",
                isActive
                  ? "bg-background text-foreground rounded px-1 font-bold"
                  : "text-muted-foreground/60 font-normal",
              )}
              title={summary}
            >
              {summaryIcon && (
                <span className="mr-1 inline-flex align-text-bottom">
                  {summaryIcon}
                </span>
              )}
              {summary}
            </span>
          )}
        </div>
        {isActive && onReset && (
          <Tooltip delayDuration={80}>
            <TooltipTrigger asChild>
              {/* The accordion trigger is already a button. */}
              <div
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  onReset();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.stopPropagation();
                    event.preventDefault();
                    onReset();
                  }
                }}
                className="text-muted-foreground hover:text-foreground flex shrink-0 cursor-pointer items-center gap-0.5 rounded-sm px-1 py-0.5 text-[11px] leading-4 font-normal transition-colors hover:underline focus-visible:underline focus-visible:outline-none"
                aria-label={`Clear ${label} filter`}
              >
                <X className="icon-sm shrink-0" />
                Clear
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Clear {label.toLowerCase()} filter
            </TooltipContent>
          </Tooltip>
        )}
      </button>
    );
  },
);
