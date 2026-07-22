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
  EVALUATOR: "border-primary-accent",
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
  /** "Playing" at the timeline playhead — glows to stand out during playback. */
  active?: boolean;
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
  active,
  compact,
  onSelect,
  onHover,
}: GraphNodeProps) {
  const display = truncateLabel(label);
  const style: React.CSSProperties = { left: x, top: y, width, height };

  const shared = cn(
    "absolute flex select-none items-center justify-center gap-1.5 overflow-hidden rounded-md px-2 text-xs font-bold transition-[box-shadow]",
    onSelect && [
      "cursor-pointer hover:ring-2 hover:ring-ring/40",
      "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
    ],
    // Playhead glow ("playing at the playhead"): lift + soft accent halo. Ring
    // colors live in exactly one branch each so tailwind-merge never has to
    // arbitrate: selected+active shares the accent ring (the two signals
    // reinforce), selected-only keeps the neutral selection ring.
    active && "z-10 shadow-[0_0_16px_2px_hsl(var(--primary-accent)/0.65)]",
    active && !selected && "ring-primary-accent ring-2",
    selected &&
      (active
        ? "ring-primary-accent ring-2 ring-offset-1"
        : "ring-ring ring-2 ring-offset-1"),
  );

  // Real-HTML accessibility (the win over the old canvas renderer): selectable
  // nodes are keyboard-focusable buttons announced with their type + label.
  const handlers = onSelect
    ? {
        role: "button" as const,
        tabIndex: 0,
        "aria-label": `${type} ${label}${counter ?? ""}`,
        "aria-pressed": !!selected,
        onClick: (event: React.MouseEvent) => {
          event.stopPropagation(); // don't trigger the canvas background deselect
          onSelect(id);
        },
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onSelect(id);
          }
        },
        onMouseEnter: onHover ? () => onHover(id) : undefined,
        onMouseLeave: onHover ? () => onHover(null) : undefined,
      }
    : {
        onMouseEnter: onHover ? () => onHover(id) : undefined,
        onMouseLeave: onHover ? () => onHover(null) : undefined,
      };

  // Tooltip only when the label is hidden (compact) — otherwise the label
  // span's own title covers truncation (both estimator and CSS ellipsis).
  const containerTitle = compact ? label : undefined;

  if (isStartNode(id) || isEndNode(id)) {
    const isStart = isStartNode(id);
    return (
      <div
        style={style}
        title={containerTitle}
        className={cn(
          shared,
          "border-2 text-white",
          isStart
            ? "border-green-700 bg-green-600"
            : "border-red-700 bg-red-600",
        )}
        {...handlers}
      >
        {!compact && (
          <span className="min-w-0 truncate" title={label}>
            {display}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={style}
      title={containerTitle}
      className={cn(
        shared,
        "bg-background text-foreground border-2",
        TYPE_BORDER_CLASS[type] ?? DEFAULT_BORDER_CLASS,
      )}
      {...handlers}
    >
      {renderFilterIcon(type)}
      {!compact && (
        <>
          <span className="min-w-0 truncate" title={label}>
            {display}
          </span>
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
