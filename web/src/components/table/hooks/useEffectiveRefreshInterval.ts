import { useIsMobile } from "@/src/hooks/use-mobile";
import { type RefreshInterval } from "@/src/components/table/utils/refresh-intervals";

/**
 * Interval the auto-refresh timer should honor.
 *
 * Uses the same `useIsMobile` breakpoint as the interval selector. The stored
 * choice is left as-is, so leaving the narrow layout starts it again and the
 * selector is there to stop it. Below that breakpoint the selector is not
 * mounted and the timer stays off; manual refresh is the only update.
 */
export function useEffectiveRefreshInterval(
  interval: RefreshInterval,
): RefreshInterval {
  const isMobile = useIsMobile();
  return isMobile ? null : interval;
}
