import { RefreshCw, ChevronDown } from "lucide-react";
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
   * Space-tight variant (e.g. the mobile Filters sheet header): the split
   * control drops the "Off" label when auto-refresh is disabled and gains an
   * accent border (plus the interval label, e.g. "30s") once an interval is
   * set. Default (non-compact) is unchanged.
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

  return (
    <div className="flex items-center">
      <Button
        variant="outline"
        size="icon"
        onClick={onRefresh}
        aria-busy={isSpinning}
        className={cn(
          "rounded-r-none border-r-0",
          compact && isActive && "border-primary",
        )}
        title="Refresh"
      >
        <RefreshCw className={cn("h-4 w-4", isSpinning && "animate-spin")} />
      </Button>
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
            <ChevronDown className="h-4 w-4" />
            {compact ? (
              // Drop the "Off" label; surface the interval only when set.
              isActive && (
                <span className="ml-1 text-sm">{activeInterval?.label}</span>
              )
            ) : (
              <span className="ml-1 text-sm @max-[42rem]/pageheader:hidden">
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
  );
}
