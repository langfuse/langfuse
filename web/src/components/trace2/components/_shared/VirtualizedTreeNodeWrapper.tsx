/**
 * TreeNodeWrapper - Generic tree structure renderer.
 *
 * Responsibilities:
 * - Render tree visual structure (indents, connector lines)
 * - Render collapse/expand button
 * - Handle selection state and click events
 *
 * Does NOT know about:
 * - Domain-specific content (that's passed as children)
 * - What kind of data is being displayed
 *
 * This component wraps arbitrary content, making it reusable for any tree view.
 */

import { type ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { ChevronRight } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export interface TreeNodeMetadata {
  depth: number;
  treeLines: boolean[];
  isLastSibling: boolean;
}

interface TreeNodeWrapperProps {
  // Tree structure data
  metadata: TreeNodeMetadata;
  nodeType: LangfuseItemType; // For the icon badge (e.g., "SPAN", "GENERATION", "TRACE")
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;

  // Selection/interaction
  isSelected: boolean;
  onSelect: () => void;

  // Content to render (fully decoupled from tree structure)
  children: ReactNode;

  // Optional customization
  className?: string;
}

export function VirtualizedTreeNodeWrapper({
  metadata,
  nodeType,
  hasChildren,
  isCollapsed,
  onToggleCollapse,
  isSelected,
  onSelect,
  children,
  className,
}: TreeNodeWrapperProps) {
  const { depth, treeLines, isLastSibling } = metadata;

  return (
    <div
      className={cn(
        "relative flex w-full cursor-pointer px-0",
        isSelected ? "bg-muted" : "hover:bg-muted/50",
        className,
      )}
      style={{
        paddingTop: 0,
        paddingBottom: 0,
      }}
      onClick={(e) => {
        if (!e.currentTarget?.closest("[data-expand-button]")) {
          onSelect();
        }
      }}
    >
      <div className="flex w-full pl-2">
        {/* 1. Indents: ancestor level indicators */}
        {depth > 0 && (
          <div className="flex flex-shrink-0">
            {Array.from({ length: depth - 1 }, (_, i) => (
              <div key={i} className="relative w-5">
                {treeLines[i] && (
                  <div className="absolute bottom-0 left-3 top-0 w-px bg-border" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* 2. Current element bars: up/down/horizontal connectors */}
        {depth > 0 && (
          <div className="relative w-5 flex-shrink-0">
            <>
              {/* Vertical bar connecting upwards */}
              <div
                className={cn(
                  "absolute left-3 top-0 w-px bg-border",
                  isLastSibling ? "h-3" : "bottom-3",
                )}
              />
              {/* Vertical bar connecting downwards if not last sibling */}
              {!isLastSibling && (
                <div className="absolute bottom-0 left-3 top-3 w-px bg-border" />
              )}
              {/* Horizontal bar connecting to icon */}
              <div className="absolute left-3 top-3 h-px w-2 bg-border" />
            </>
          </div>
        )}

        {/* 3. Icon + child connector: fixed width container */}
        <div className="relative flex w-6 flex-shrink-0 flex-col py-1.5">
          <div className="relative z-10 flex h-4 items-center justify-center">
            <ItemBadge type={nodeType} isSmall className="!size-3" />
          </div>
          {/* Vertical bar downwards if there are expanded children */}
          {hasChildren && !isCollapsed && (
            <div className="absolute bottom-0 left-1/2 top-3 w-px bg-border" />
          )}
          {/* Root node downward connector */}
          {depth === 0 && hasChildren && !isCollapsed && (
            <div className="absolute bottom-0 left-1/2 top-3 w-px bg-border" />
          )}
        </div>

        {/* 4. Content area (passed as children - completely decoupled) */}
        <div className="flex min-w-0 flex-1">{children}</div>

        {/* 5. Expand/Collapse button */}
        {hasChildren && (
          <div className="flex items-center justify-end py-1 pr-1">
            <Button
              aria-expanded={!isCollapsed}
              data-expand-button
              size="icon"
              variant="ghost"
              onClick={(ev) => {
                ev.stopPropagation();
                onToggleCollapse();
              }}
              className="h-6 w-6 flex-shrink-0 hover:bg-primary/10"
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform transition-transform duration-200 ease-in-out",
                  isCollapsed ? "rotate-0" : "rotate-90",
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
