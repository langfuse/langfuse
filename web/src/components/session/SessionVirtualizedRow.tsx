import { type ReactNode } from "react";
import { type VirtualItem, type Virtualizer } from "@tanstack/react-virtual";
import { useStableVirtualRowMeasurement } from "@/src/components/session/useStableVirtualRowMeasurement";

export function SessionVirtualizedRow({
  children,
  itemKey,
  measurementKey = itemKey,
  source,
  virtualItem,
  virtualizer,
}: {
  children: ReactNode;
  itemKey: string | number;
  measurementKey?: string | number;
  source: "legacy" | "events";
  virtualItem: VirtualItem;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
}) {
  const measurementRef = useStableVirtualRowMeasurement({
    index: virtualItem.index,
    itemKey: measurementKey,
    isScrolling: Boolean(virtualizer.isScrolling),
    virtualizer,
  });

  return (
    <div
      ref={measurementRef}
      data-index={virtualItem.index}
      data-session-virtualizer-row={source}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${virtualItem.start}px)`,
      }}
    >
      {children}
    </div>
  );
}
