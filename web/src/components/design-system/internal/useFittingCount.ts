import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

/** Matches `gap-1` between chips. */
const CHIP_GAP = 4;

/**
 * How many chips of a single-line list fit in `listRef`'s width, at least one,
 * leaving room for a `+N` chip when not all do. `probeRef` holds an invisible
 * copy of every chip followed by the widest `+N` chip, so their natural widths
 * can be measured without the visible list reserving space for them.
 */
export function useFittingCount({
  itemCount,
  itemsKey,
  isEnabled = true,
}: {
  itemCount: number;
  /** Changes whenever a chip's content does, so widths are measured again. */
  itemsKey: string;
  isEnabled?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [fittingCount, setFittingCount] = useState(itemCount);

  useLayoutEffect(() => {
    const list = listRef.current;
    const probe = probeRef.current;
    if (!isEnabled || !list || !probe) return;

    const update = () => {
      const widths = [...probe.children].map(
        (child) => (child as HTMLElement).offsetWidth,
      );
      const overflowWidth = widths.pop() ?? 0;
      // Sub-pixel rounding at the exact boundary: allow a pixel of slack.
      const available = list.clientWidth + 1;
      const allWidth = sumWithGaps(widths);
      if (allWidth <= available) {
        setFittingCount(widths.length);
        return;
      }
      let count = 0;
      while (
        count < widths.length &&
        sumWithGaps(widths.slice(0, count + 1)) + CHIP_GAP + overflowWidth <=
          available
      ) {
        count++;
      }
      setFittingCount(Math.max(1, count));
    };

    update();
    if (typeof ResizeObserver === "undefined") return;
    // Resize callbacks run before paint; a synchronous commit keeps it that way.
    const observer = new ResizeObserver(() => flushSync(update));
    observer.observe(list);
    return () => observer.disconnect();
  }, [isEnabled, itemsKey]);

  return { listRef, probeRef, fittingCount };
}

function sumWithGaps(widths: number[]): number {
  return widths.reduce(
    (sum, width, index) => sum + width + (index > 0 ? CHIP_GAP : 0),
    0,
  );
}
