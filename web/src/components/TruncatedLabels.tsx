/* eslint-disable @repo/no-style-props */
import React from "react";
import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { PRODUCTION_LABEL, LATEST_PROMPT_LABEL } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";

interface TruncatedLabelsProps {
  labels: string[];
  maxVisibleLabels?: number;
  className?: string;
}

export function TruncatedLabels({
  labels,
  maxVisibleLabels = 5,
  className,
}: TruncatedLabelsProps) {
  // Enhanced sorting: prioritize latest and production labels
  const sortedLabels = [...labels].sort((a, b) => {
    // Production label comes first
    if (a === PRODUCTION_LABEL) return -1;
    if (b === PRODUCTION_LABEL) return 1;

    // Latest label comes second
    if (a === LATEST_PROMPT_LABEL) return -1;
    if (b === LATEST_PROMPT_LABEL) return 1;

    // Then alphabetically
    return a.localeCompare(b);
  });

  // Split labels into visible and hidden
  const visibleLabels = sortedLabels.slice(0, maxVisibleLabels);
  const hiddenLabels = sortedLabels.slice(maxVisibleLabels);
  const hasHiddenLabels = hiddenLabels.length > 0;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {visibleLabels.map((label) => (
        <LabelChip key={label} label={label} />
      ))}
      {hasHiddenLabels && (
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
