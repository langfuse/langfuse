/**
 * LogViewObservationCell - Cell component for the observation column.
 *
 * Handles viewport-based prefetching with debounce to load observation
 * data before user expands the row.
 */

import { memo, useRef, useEffect } from "react";
import { ItemBadge } from "@/src/components/ItemBadge";
import { usePrefetchObservation } from "@/src/components/trace2/api/usePrefetchObservation";
import { TRACE_VIEW_CONFIG } from "@/src/components/trace2/config/trace-view-config";
import { type FlatLogItem } from "./log-view-types";
import { formatDisplayName } from "./log-view-formatters";

// Constants for prefetching behavior
const {
  prefetch: {
    rootMargin: PREFETCH_ROOT_MARGIN,
    debounceMs: PREFETCH_DEBOUNCE_MS,
  },
  indentPx: INDENT_PX,
} = TRACE_VIEW_CONFIG.logView;

export interface LogViewObservationCellProps {
  item: FlatLogItem;
  indentEnabled: boolean;
  projectId: string;
  traceId: string;
}

/**
 * Cell component that prefetches observation data when entering viewport.
 */
export const LogViewObservationCell = memo(function LogViewObservationCell({
  item,
  indentEnabled,
  projectId,
  traceId,
}: LogViewObservationCellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { prefetch } = usePrefetchObservation({ projectId });
  const hasPrefetched = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || item.node.type === "TRACE") return;

    // Reset prefetch flag when item changes to ensure we prefetch new data
    hasPrefetched.current = false;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !hasPrefetched.current) {
          // Debounce: wait before prefetching to avoid firing
          // many requests during fast scrolling
          timeoutRef.current = setTimeout(() => {
            hasPrefetched.current = true;
            prefetch(item.node.id, traceId, item.node.startTime);
          }, PREFETCH_DEBOUNCE_MS);
        } else if (!entry?.isIntersecting && timeoutRef.current) {
          // Cancel pending prefetch if element leaves viewport
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      },
      { rootMargin: PREFETCH_ROOT_MARGIN },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [item.node.id, item.node.type, item.node.startTime, traceId, prefetch]);

  const displayName = formatDisplayName(item.node);
  const childrenCount = item.node.children?.length ?? 0;
  const indent = indentEnabled ? item.node.depth * INDENT_PX : 0;

  return (
    <div
      ref={ref}
      className="flex h-5 min-w-0 items-center gap-2"
      style={{ paddingLeft: indent }}
    >
      <ItemBadge type={item.node.type} isSmall />
      <span className="truncate">{displayName}</span>
      {childrenCount > 0 && (
        <span className="flex-shrink-0 text-xs text-muted-foreground">
          {childrenCount} {childrenCount === 1 ? "item" : "items"}
        </span>
      )}
    </div>
  );
});
