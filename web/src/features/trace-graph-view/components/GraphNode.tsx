import React from "react";

import { renderFilterIcon } from "@/src/components/ItemBadge";
import { cn } from "@/src/utils/tailwind";
import { truncateLabel } from "../layout/measureNode";
import {
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
} from "../types";

/**
 * Per-type border accent, matching `ItemBadge`'s icon palette exactly (same
 * shade, same theme-aware muted-* vars) so a node's border, its icon, and the
 * type's badge in the tree/timeline all read as one color across light/dark.
 */
const TYPE_BORDER_CLASS: Record<string, string> = {
  AGENT: "border-purple-600",
  TOOL: "border-orange-600",
  GENERATION: "border-muted-magenta",
  SPAN: "border-muted-blue",
  CHAIN: "border-pink-600",
  RETRIEVER: "border-teal-600",
  EVENT: "border-muted-green",
  EMBEDDING: "border-amber-600",
  GUARDRAIL: "border-red-600",
};
const DEFAULT_BORDER_CLASS = "border-muted-blue";

const isStartNode = (id: string) =>
  id === LANGFUSE_START_NODE_NAME || id === LANGGRAPH_START_NODE_NAME;
const isEndNode = (id: string) =>
  id === LANGFUSE_END_NODE_NAME || id === LANGGRAPH_END_NODE_NAME;

export type GraphNodeProps = {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Suffix appended after the label, e.g. " (2/3)" for observation cycling. */
  counter?: string;
  selected?: boolean;
  dimmed?: boolean;
  /** Hide the text label (when zoomed out) — keeps the box, shows only the icon. */
  compact?: boolean;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
};

function GraphNodeComponent({
  id,
  label,
  type,
  x,
  y,
  width,
  height,
  counter,
  selected,
  dimmed,
  compact,
  onSelect,
  onHover,
}: GraphNodeProps) {
  const display = truncateLabel(label);
  const style: React.CSSProperties = { left: x, top: y, width, height };

  const shared = cn(
    "absolute flex select-none items-center justify-center gap-1.5 overflow-hidden rounded-md px-2 text-xs font-medium transition-[opacity,box-shadow]",
    onSelect && "cursor-pointer hover:ring-2 hover:ring-ring/40",
    dimmed && "opacity-35",
  );

  const handlers = {
    onClick: onSelect
      ? (event: React.MouseEvent) => {
          event.stopPropagation(); // don't trigger the canvas background deselect
          onSelect(id);
        }
      : undefined,
    onMouseEnter: onHover ? () => onHover(id) : undefined,
    onMouseLeave: onHover ? () => onHover(null) : undefined,
  };

  if (isStartNode(id) || isEndNode(id)) {
    const isStart = isStartNode(id);
    return (
      <div
        style={style}
        className={cn(
          shared,
          "border-2 text-white",
          isStart
            ? "border-green-700 bg-green-600"
            : "border-red-700 bg-red-600",
          selected && "ring-ring ring-2 ring-offset-1",
        )}
        {...handlers}
      >
        {!compact && <span className="truncate">{display}</span>}
      </div>
    );
  }

  return (
    <div
      style={style}
      title={truncateLabel(label) === label ? undefined : label}
      className={cn(
        shared,
        "bg-background text-foreground border-2",
        TYPE_BORDER_CLASS[type] ?? DEFAULT_BORDER_CLASS,
        selected && "ring-ring ring-2 ring-offset-1",
      )}
      {...handlers}
    >
      {renderFilterIcon(type)}
      {!compact && (
        <>
          <span className="truncate">{display}</span>
          {counter && (
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {counter}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export const GraphNode = React.memo(GraphNodeComponent);
