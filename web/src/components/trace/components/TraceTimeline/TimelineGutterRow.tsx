/**
 * TimelineGutterRow - the left, fixed gutter cell for one waterfall row.
 *
 * Pure depth coordinate: tree connectors + icon + name. It lives in the gutter
 * pane (which never scrolls horizontally), so hover/selection highlighting is
 * scoped to this narrow cell — the wide chart never gets a full-width band.
 *
 * Connectors are absolute lines at computed rail x's. Each parent→child line is
 * two segments (parent draws center→bottom, child draws top→center) meeting at
 * the shared row boundary, so the line is continuous at every depth. The rail
 * sits a gap to the LEFT of the icon (it never crosses it), and the elbow stops
 * at the icon.
 */

import { type TimelineGutterRowProps } from "./types";
import { ItemBadge } from "@/src/components/ItemBadge";
import { ChevronRight } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

const INDENT = 14; // px per depth level
const RAIL = 7; // x of a level's vertical rail within its indent step
const ICON_GAP = 6; // gap from a node's rail to its icon

export function TimelineGutterRow({
  item,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  onToggleCollapse,
  hasChildren,
  isCollapsed,
}: TimelineGutterRowProps) {
  const { node, depth, treeLines, isLastSibling } = item;

  const ownRailX = depth * INDENT + RAIL;
  const parentRailX = (depth - 1) * INDENT + RAIL;
  const showsChildSpine = hasChildren && !isCollapsed;
  const contentLeft = ownRailX + ICON_GAP;

  return (
    <div
      className={cn(
        "relative flex h-full w-full cursor-pointer items-center pr-2",
        // Whole-row highlight is driven by shared state (so hovering the chart
        // highlights the caption too). Selected uses an accent tint so it stays
        // distinct from the neutral bar (bg-muted) — otherwise the bar vanishes
        // into the selected row; hover stays neutral.
        isSelected ? "bg-primary-accent/10" : isHovered ? "bg-muted" : "",
      )}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      {/* Selected accent bar (no layout shift). */}
      {isSelected && (
        <div className="bg-primary-accent absolute inset-y-0 left-0 w-0.5" />
      )}
      {/* Ancestor rails: continue through this row for ancestors with a sibling below. */}
      {treeLines
        .slice(0, Math.max(0, depth - 1))
        .map((continues, level) =>
          continues ? (
            <div
              key={level}
              className="bg-border absolute inset-y-0 w-px"
              style={{ left: `${level * INDENT + RAIL}px` }}
            />
          ) : null,
        )}

      {depth > 0 && (
        <>
          {/* This node's vertical off the parent rail: top→center (last) or full. */}
          <div
            className={cn(
              "bg-border absolute top-0 w-px",
              isLastSibling ? "h-1/2" : "bottom-0",
            )}
            style={{ left: `${parentRailX}px` }}
          />
          {/* Elbow: parent rail → icon, at the row's vertical center. */}
          <div
            className="bg-border absolute top-1/2 h-px"
            style={{
              left: `${parentRailX}px`,
              width: `${INDENT + ICON_GAP}px`,
            }}
          />
        </>
      )}

      {/* Downward stub to this node's children, on its own rail (left of the icon). */}
      {showsChildSpine && (
        <div
          className="bg-border absolute top-1/2 bottom-0 w-px"
          style={{ left: `${ownRailX}px` }}
        />
      )}

      {/* Icon + name. The icon is offset to a node's rail; the rail sits a gap
          to its left so it never crosses the chip. */}
      <div
        className="flex min-w-0 flex-1 items-center gap-2"
        style={{ paddingLeft: `${contentLeft}px` }}
      >
        {/* Wrap to keep the badge from flex-shrinking (ItemBadge's className
            only reaches the inner icon, not the Badge wrapper). */}
        <div className="shrink-0">
          <ItemBadge type={node.type} isSmall />
        </div>
        <span
          className="text-primary min-w-0 flex-1 truncate text-xs font-medium"
          title={node.name}
        >
          {node.name || `Unnamed ${node.type.toLowerCase()}`}
        </span>
      </div>

      {/* Expand/collapse caret, pinned right (as in the tree view). */}
      {hasChildren && (
        <button
          type="button"
          aria-label={isCollapsed ? "Expand" : "Collapse"}
          aria-expanded={!isCollapsed}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className="hover:bg-muted-foreground/10 ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded"
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              !isCollapsed && "rotate-90",
            )}
          />
        </button>
      )}
    </div>
  );
}
