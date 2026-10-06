/* eslint-disable @repo/no-style-props */
import React from "react";
import { Button } from "@/src/components/ui/button";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { PRODUCTION_LABEL, LATEST_PROMPT_LABEL } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";

interface TruncatedLabelsProps {
  labels: string[];
  maxVisibleLabels?: number;
  className?: string;
  showSimpleBadges?: boolean;
}

export function TruncatedLabels({
  labels,
  maxVisibleLabels = 5,
  className,
  showSimpleBadges = false,
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
      {visibleLabels.map((label) =>
        showSimpleBadges ? (
          <div
            key={label}
            className="bg-secondary text-secondary-foreground max-h-fit min-h-6 w-fit content-center rounded-sm px-1 text-left text-xs font-bold"
          >
            {label}
          </div>
        ) : (
          <StatusBadge
            type={label}
            key={label}
            isLive={label === PRODUCTION_LABEL}
            preserveCase
          />
        ),
      )}
      {hasHiddenLabels && (
        <HoverCard
          placement="bottom-start"
          content={
            <div className="w-80 p-3">
              <div className="space-y-2">
                <h4 className="text-sm font-bold">All Labels</h4>
                <div className="flex flex-wrap gap-1">
                  {sortedLabels.map((label) =>
                    showSimpleBadges ? (
                      <div
                        key={label}
                        className="bg-secondary text-secondary-foreground max-h-fit min-h-6 w-fit content-center rounded-sm px-1 text-left text-xs font-bold"
                      >
                        {label}
                      </div>
                    ) : (
                      <StatusBadge
                        type={label}
                        key={label}
                        isLive={label === PRODUCTION_LABEL}
                        preserveCase
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
          }
        >
          {({ getTriggerProps }) => (
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-6 cursor-pointer text-xs"
              {...getTriggerProps()}
            >
              +{hiddenLabels.length} more
            </Button>
          )}
        </HoverCard>
      )}
    </div>
  );
}
