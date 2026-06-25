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
        "group relative flex h-full w-full cursor-pointer items-center pr-2",
        isSelected ? "bg-muted" : "hover:bg-muted/50",
      )}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
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
        <ItemBadge type={node.type} isSmall className="shrink-0" />
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
