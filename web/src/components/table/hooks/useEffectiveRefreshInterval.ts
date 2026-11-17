import { useIsMobile } from "@/src/hooks/use-mobile";
import { type RefreshInterval } from "@/src/components/table/utils/refresh-intervals";

/**
 * Interval the auto-refresh timer should honor.
 *
 * The stored choice is left as-is, so a viewport at `md` or wider starts it
 * again. Below that breakpoint the interval selector is hidden and the timer
 * stays off; manual refresh is the only update.
 */
export function useEffectiveRefreshInterval(
  interval: RefreshInterval,
): RefreshInterval {
  const isMobile = useIsMobile();
  return isMobile ? null : interval;
}
