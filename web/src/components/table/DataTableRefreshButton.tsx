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
   * label, e.g. "30s") once an interval is set. On a narrow viewport the
   * interval side is omitted either way. Default (non-compact) is unchanged
   * when the interval selector is shown.
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
  // Same predicate as the auto-refresh timer. Tailwind `md` is 48rem and
  // follows the user's font size, so a CSS hide would not match the timer.
  const showInterval = !useIsMobile();

  return (
    <div className="flex items-center">
      <Button
        variant="outline"
        size="icon"
        onClick={onRefresh}
        aria-busy={isSpinning}
        className={cn(
          // Split button only while the interval selector is mounted.
          showInterval && "rounded-r-none border-r-0",
          compact && isActive && showInterval && "border-primary",
        )}
        title="Refresh"
      >
        <RefreshCw
          size="base"
          color="default"
          __rawClassName={cn(isSpinning && "animate-spin")}
        />
      </Button>
      {showInterval && (
        <DropdownMenu>
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
      )}
    </div>
  );
}
