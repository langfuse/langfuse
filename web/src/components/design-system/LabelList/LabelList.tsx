import { cva } from "class-variance-authority";
import { LATEST_PROMPT_LABEL, PRODUCTION_LABEL } from "@langfuse/shared";

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
      false: "flex-nowrap overflow-hidden",
    },
  },
  defaultVariants: {
    layout: "contained",
    wrap: true,
  },
});

type LabelListProps = {
  labels: string[];
  /** Labels beyond this count collapse into a `+N` hover card. */
  maxVisible?: number;
} & (
  | {
      layout?: "contained";
      /** Single-line lists clip overflow instead of wrapping. */
      shouldWrap?: boolean;
    }
  | {
      layout: "inline";
      shouldWrap?: never;
    }
);

function sortLabels(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    if (a === PRODUCTION_LABEL) return -1;
    if (b === PRODUCTION_LABEL) return 1;
    if (a === LATEST_PROMPT_LABEL) return -1;
    if (b === LATEST_PROMPT_LABEL) return 1;
    return a.localeCompare(b);
  });
}

export function LabelList({
  labels,
  maxVisible = 5,
  layout = "contained",
  shouldWrap = true,
}: LabelListProps) {
  const sortedLabels = sortLabels(labels);
  const visibleLabels = sortedLabels.slice(0, maxVisible);
  const hiddenLabels = sortedLabels.slice(maxVisible);

  return (
    <div className={labelListVariants({ layout, wrap: shouldWrap })}>
      {visibleLabels.map((label) => (
        <LabelChip key={label} label={label} />
      ))}
      {hiddenLabels.length > 0 && (
        <HoverCard
          placement="bottom-start"
          content={
            <div className="w-80 p-3">
              <div className="space-y-2">
                <h4 className="text-sm font-bold">All Labels</h4>
                <div className="flex flex-wrap gap-1">
                  {sortedLabels.map((label) => (
                    <LabelChip key={label} label={label} />
                  ))}
                </div>
              </div>
            </div>
          }
        >
          {({ getTriggerProps }) => (
            <BadgeShell asChild color="filled" font="mono" size="md">
              <button
                type="button"
                className="text-muted-foreground cursor-pointer self-center"
                aria-label={`Show all ${sortedLabels.length} labels`}
                {...getTriggerProps()}
              >
                +{hiddenLabels.length}
              </button>
            </BadgeShell>
          )}
        </HoverCard>
      )}
    </div>
  );
}

function LabelChip({ label }: { label: string }) {
  return (
    <BadgeShell color="filled" font="mono" size="md">
      {label === PRODUCTION_LABEL && (
        <span className="bg-dark-green size-1.5 shrink-0 rounded-full" />
      )}
      <span className="truncate py-0.5" title={label}>
        {label}
      </span>
    </BadgeShell>
  );
}
