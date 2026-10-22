import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cva } from "class-variance-authority";

import { BadgeShell } from "../Badge/Badge";
import { HoverCard } from "../HoverCard/HoverCard";

const labelListVariants = cva("", {
  variants: {
    layout: {
      contained: "flex gap-1",
      /** Labels flow as direct children of the host's flex-wrap row. */
      inline: "contents",
    },
    wrap: {
      true: "flex-wrap",
      false: "relative min-w-0 flex-nowrap items-center",
    },
  },
  defaultVariants: {
    layout: "contained",
    wrap: true,
  },
});

const DEFAULT_MAX_VISIBLE = 5;
/** Matches `gap-1` between chips. */
const CHIP_GAP = 4;

export function LabelList(props: LabelListProps) {
  const { labels, layout = "contained" } = props;
  const isSingleLine = layout === "contained" && props.shouldWrap === false;
  const { listRef, probeRef, fittingCount } = useFittingCount(
    labels,
    isSingleLine,
  );
  const visibleCount = isSingleLine
    ? fittingCount
    : (props.maxVisible ?? DEFAULT_MAX_VISIBLE);
  const visibleLabels = labels.slice(0, visibleCount);
  const hiddenCount = labels.length - visibleLabels.length;
  const renderChip = (label: LabelListItem) => (
    <LabelChip
      key={label.name}
      name={label.name}
      isProduction={label.isProduction ?? false}
    />
  );
  const overflow =
    hiddenCount > 0 ? (
      <LabelOverflow
        chips={labels.map(renderChip)}
        totalCount={labels.length}
        hiddenCount={hiddenCount}
      />
    ) : null;

  if (!isSingleLine) {
    return (
      <div className={labelListVariants({ layout, wrap: true })}>
        {visibleLabels.map(renderChip)}
        {overflow}
      </div>
    );
  }

  return (
    <div ref={listRef} className={labelListVariants({ wrap: false })}>
      <div className="flex min-w-0 gap-1 overflow-hidden">
        {visibleLabels.map(renderChip)}
      </div>
      {overflow}
      {/* Natural chip widths, measured to decide how many fit. */}
      <div
        ref={probeRef}
        aria-hidden
        className="pointer-events-none invisible absolute flex w-max gap-1"
      >
        {labels.map(renderChip)}
        <BadgeShell color="filled" font="mono" size="md">
          +{labels.length}
        </BadgeShell>
      </div>
    </div>
  );
}

export type LabelListItem = {
  name: string;
  /** Shows the production marker. */
  isProduction?: boolean;
};

type LabelListProps = {
  /** Rendered in the given order. */
  labels: LabelListItem[];
} & (
  | {
      layout?: "contained";
      shouldWrap?: true;
      /** Labels beyond this count collapse into a `+N` hover card. */
      maxVisible?: number;
    }
  | {
      layout?: "contained";
      /** One line: as many labels as fit, the rest collapse into `+N`. */
      shouldWrap: false;
      maxVisible?: never;
    }
  | {
      layout: "inline";
      shouldWrap?: never;
      maxVisible?: number;
    }
);

function useFittingCount(labels: LabelListItem[], isEnabled: boolean) {
  const listRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [fittingCount, setFittingCount] = useState(labels.length);
  const labelsKey = labels
    .map((label) => `${label.name}:${label.isProduction ?? false}`)
    .join("\u0000");

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
  }, [isEnabled, labelsKey]);

  return { listRef, probeRef, fittingCount };
}

function sumWithGaps(widths: number[]): number {
  return widths.reduce(
    (sum, width, index) => sum + width + (index > 0 ? CHIP_GAP : 0),
    0,
  );
}

function LabelOverflow({
  chips,
  totalCount,
  hiddenCount,
}: {
  chips: ReactNode;
  totalCount: number;
  hiddenCount: number;
}) {
  return (
    <HoverCard
      placement="bottom-start"
      content={
        <div className="w-80 p-3">
          <div className="space-y-2">
            <h4 className="text-sm font-bold">All Labels</h4>
            <div className="flex flex-wrap gap-1">{chips}</div>
          </div>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <BadgeShell asChild color="filled" font="mono" size="md">
          <button
            type="button"
            className="text-muted-foreground cursor-pointer self-center"
            aria-label={`Show all ${totalCount} labels`}
            {...getTriggerProps()}
          >
            +{hiddenCount}
          </button>
        </BadgeShell>
      )}
    </HoverCard>
  );
}

function LabelChip({
  name,
  isProduction,
}: {
  name: string;
  isProduction: boolean;
}) {
  return (
    <BadgeShell color="filled" font="mono" size="md">
      {isProduction && (
        <span className="bg-dark-green size-1.5 shrink-0 rounded-full" />
      )}
      <span className="truncate py-0.5" title={name}>
        {name}
      </span>
    </BadgeShell>
  );
}
