import { RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { useEffect, useRef, useState } from "react";
import useSessionStorage from "@/src/components/useSessionStorage";
import { cn } from "@/src/utils/tailwind";

const REFRESH_INTERVALS = [
  { label: "Off", value: null },
  { label: "30s", value: 30_000 },
  { label: "1m", value: 60_000 },
  { label: "5m", value: 300_000 },
] as const;

type RefreshInterval = (typeof REFRESH_INTERVALS)[number]["value"];

interface DataTableRefreshButtonProps {
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
  /** Project ID for scoping the session storage key */
  projectId: string;
  /** Table name for scoping the session storage key (e.g., "traces", "sessions") */
  tableName: string;
}

export function DataTableRefreshButton({
  onRefresh,
  isRefreshing = false,
  projectId,
  tableName,
}: DataTableRefreshButtonProps) {
  const [interval, setIntervalState] = useSessionStorage<RefreshInterval>(
    `tableRefreshInterval-${tableName}-${projectId}`,
    null,
  );
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleManualRefresh = async () => {
    setIsManualRefresh(true);
    try {
      await onRefresh();
    } finally {
      setIsManualRefresh(false);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (interval) {
      // Validate interval is one of the allowed values
      const isValidInterval = REFRESH_INTERVALS.some(
        (option) => option.value === interval,
      );
      if (!isValidInterval) {
        console.warn(
          `Invalid refresh interval ${interval} detected, ignoring.`,
        );
        return;
      }
      intervalRef.current = setInterval(() => {
        void onRefresh();
      }, interval);
    }
        void onRefresh();
      }, interval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [interval, onRefresh]);

  const showSpinner = isRefreshing || isManualRefresh;
  const activeInterval = REFRESH_INTERVALS.find((i) => i.value === interval);

  return (
    <div className="flex items-center">
      <Button
        variant="outline"
        size="icon"
        onClick={handleManualRefresh}
        disabled={showSpinner}
        className="rounded-r-none border-r-0"
        title="Refresh"
      >
        <RefreshCw className={cn("h-4 w-4", showSpinner && "animate-spin")} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-l-none px-2">
            <ChevronDown className="h-4 w-4" />
            <span className="ml-1 text-sm">
              {activeInterval?.label ?? "Off"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={String(interval)}
            onValueChange={(value) =>
              setIntervalState(
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
