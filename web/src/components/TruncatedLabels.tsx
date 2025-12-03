import React from "react";
import { Button } from "@/src/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { PRODUCTION_LABEL, LATEST_PROMPT_LABEL } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";

interface TruncatedLabelsProps {
  labels: string[];
  maxVisibleLabels?: number;
  className?: string;
  badgeClassName?: string;
  showSimpleBadges?: boolean;
}

export function TruncatedLabels({
  labels,
  maxVisibleLabels = 5,
  className,
  badgeClassName,
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

  if (sortedLabels.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {visibleLabels.map((label) =>
        showSimpleBadges ? (
          <div
            key={label}
            className={cn(
              "max-h-fit min-h-6 w-fit content-center rounded-sm bg-secondary px-1 text-left text-xs font-semibold text-secondary-foreground",
              badgeClassName,
            )}
          >
            {label}
          </div>
        ) : (
          <StatusBadge
            type={label}
            key={label}
            className={cn("break-all sm:break-normal", badgeClassName)}
            isLive={label === PRODUCTION_LABEL}
          />
        ),
      )}
      {hasHiddenLabels && (
        <HoverCard>
          <HoverCardTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            >
              +{hiddenLabels.length} more
            </Button>
          </HoverCardTrigger>
          <HoverCardContent className="w-80 p-3" side="bottom" align="start">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">All Labels</h4>
              <div className="flex flex-wrap gap-1">
                {sortedLabels.map((label) =>
                  showSimpleBadges ? (
                    <div
                      key={label}
                      className={cn(
                        "max-h-fit min-h-6 w-fit content-center rounded-sm bg-secondary px-1 text-left text-xs font-semibold text-secondary-foreground",
                        badgeClassName,
                      )}
                    >
                      {label}
                    </div>
                  ) : (
                    <StatusBadge
                      type={label}
                      key={label}
                      className={cn(
                        "break-all sm:break-normal",
                        badgeClassName,
                      )}
                      isLive={label === PRODUCTION_LABEL}
                    />
                  ),
                )}
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  );
}
