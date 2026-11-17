import { useState } from "react";
import { RefreshCw, ChevronDown } from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { cn } from "@/src/utils/tailwind";
import { useAnimatedBusy } from "@/src/hooks/useAnimatedBusy";
import { useIsMobile } from "@/src/hooks/use-mobile";
import {
  REFRESH_INTERVALS,
  type RefreshInterval,
} from "@/src/components/table/utils/refresh-intervals";

interface DataTableRefreshButtonProps {
  onRefresh: () => void;
  isRefreshing: boolean;
  interval: RefreshInterval;
  setInterval: (interval: RefreshInterval) => void;
  /**
   * Space-tight variant: the split control drops the "Off" label when
   * auto-refresh is disabled and gains an accent border (plus the interval
   * label, e.g. "30s") once an interval is set. Below `md` the interval side
   * is hidden either way. Default (non-compact) is unchanged at `md` and up.
   */
  compact?: boolean;
}

export function DataTableRefreshButton({
  onRefresh,
  isRefreshing,
  interval,
  setInterval,
  compact = false,
}: DataTableRefreshButtonProps) {
  const activeInterval = REFRESH_INTERVALS.find((i) => i.value === interval);
  // Only a real interval counts as active; null ("Off") is the resting state.
  const isActive = interval != null;
  // A fast refresh would otherwise show a single frame of spinner. Not disabled
  // while it spins either: the flash of the disabled state read as a glitch, and
  // refreshing again mid-flight is harmless.
  const { active: isSpinning } = useAnimatedBusy(isRefreshing);
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  // The menu is portaled, so hiding the trigger does not close it. Drop an
  // open menu when the viewport crosses below `md`.
  if (isMobile && menuOpen) setMenuOpen(false);

  return (
    <div className="flex items-center">
      <Button
        variant="outline"
        size="icon"
        onClick={onRefresh}
        aria-busy={isSpinning}
        className={cn(
          // Split button only while the interval selector is visible (`md`+).
          "md:rounded-r-none md:border-r-0",
          compact && isActive && "md:border-primary",
        )}
        title="Refresh"
      >
        <RefreshCw
          size="base"
          color="default"
          __rawClassName={cn(isSpinning && "animate-spin")}
        />
      </Button>
      {/* Below `md` the interval selector is hidden; manual refresh stays. */}
      <div className="hidden md:contents">
        <DropdownMenu
          open={!isMobile && menuOpen}
          onOpenChange={(next) => {
            if (!isMobile) setMenuOpen(next);
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                "w-auto rounded-l-none border-l-0 px-2",
                compact && isActive && "border-primary text-primary",
              )}
            >
              <ChevronDown size="base" color="default" />
              {compact ? (
                // Drop the "Off" label; surface the interval only when set.
                isActive && (
                  <span className="ml-1 text-sm">{activeInterval?.label}</span>
                )
              ) : (
                <span className="ml-1 text-sm">
                  {activeInterval?.label ?? "Off"}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={String(interval)}
              onValueChange={(value) =>
                setInterval(
                  value === "null" ? null : (Number(value) as RefreshInterval),
                )
              }
            >
              {REFRESH_INTERVALS.map((option) => (
                <DropdownMenuRadioItem
                  key={String(option.value)}
                  value={String(option.value)}
                >
                  {option.label === "Off"
                    ? "Auto-refresh off"
                    : `Every ${option.label}`}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
