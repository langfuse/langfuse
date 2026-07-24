/**
 * CollapsibleBadgeRow - metadata-badge row wrapper shared by the trace and
 * observation detail headers.
 *
 * Desktop: renders the full `flex flex-wrap` badge set exactly as before.
 * Mobile: clips the badges to a single line and adds a chevron toggle that
 * expands to the full wrapped set (and collapses back). Uses local state only;
 * no effects.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { useIsMobile } from "@/src/hooks/use-mobile";

export function CollapsibleBadgeRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);

  // Desktop: unchanged full wrapped badge row.
  if (!isMobile) {
    return (
      <div className={cn("flex flex-wrap items-center gap-1", className)}>
        {children}
      </div>
    );
  }

  // Mobile: default to a single clipped line with an expand/collapse chevron.
  return (
    <div className="flex items-start gap-1">
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1",
          expanded ? "flex-wrap" : "flex-nowrap overflow-hidden",
        )}
      >
        {children}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={expanded ? "Show fewer details" : "Show more details"}
        aria-expanded={expanded}
        className="mt-0.5 shrink-0"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
