import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

interface CollapsibleSectionProps {
  title: string;
  badge?: string;
  count?: number;
  defaultExpanded?: boolean;
  actionButton?: React.ReactNode;
  children: React.ReactNode;
  isEmpty?: boolean;
  emptyMessage?: string;
  className?: string;
  summaryContent?: string | React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  badge,
  count,
  defaultExpanded = false,
  actionButton,
  children,
  isEmpty = false,
  emptyMessage,
  className,
  summaryContent,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const hasContent = count !== undefined ? count > 0 : !isEmpty;

  return (
    <div className={cn("space-y-1", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleExpanded}
          className="h-8 gap-2 px-1 hover:bg-transparent"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <span className="text-sm font-semibold">{title}</span>
          {badge && (
            <Badge variant="secondary" className="h-4 text-xs">
              {badge}
            </Badge>
          )}
          {count !== undefined && count > 0 && (
            <Badge variant="outline" className="h-4 text-xs">
              {count}
            </Badge>
          )}
        </Button>
        {actionButton && (
          <div className="flex items-center gap-1">{actionButton}</div>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="space-y-2">
          {hasContent ? (
            children
          ) : (
            <div className="px-2 py-1">
              <p className="text-xs text-muted-foreground">
                {emptyMessage || "No items configured."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Compact summary when collapsed */}
      {!isExpanded && (hasContent || summaryContent) && (
        <div className="px-2 py-0.5">
          <p className="text-xs text-muted-foreground">
            {summaryContent ||
              (count !== undefined && count > 0
                ? `${count} item${count === 1 ? "" : "s"} configured`
                : "Configured")}
          </p>
        </div>
      )}
    </div>
  );
};
