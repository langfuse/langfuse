/**
 * Shared building blocks for the double-panel layout EXPLORATION (Phase 0).
 *
 * Every "take" composes the SAME two mock panes — a NavPane (tree/timeline) and
 * a DetailPane — and only differs in how they are ARRANGED and SWITCHED. Keeping
 * the panes identical makes the takes directly comparable. The panes reuse the
 * real timeline row components (TimelineGutterRow / TimelineBar / TimelineScale)
 * so content density is true to the app. Rows render at DENSE_ROW (26px) so the
 * exploration also previews the LFE-10539 density target.
 *
 * Prototype-only: local state, lightweight pointer-drag resizers, and a
 * ResizeObserver width probe stand in for the app's contexts / react-resizable-
 * panels so the stories stay self-contained.
 */

import { useCallback, useLayoutEffect, useState, type ReactNode } from "react";
import { Copy, Search, Settings2, Share2, Star, Trash2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import { ItemBadge } from "@/src/components/ItemBadge";
import { type TreeNode } from "../../../lib/types";
import { TimelineGutterRow } from "../../TraceTimeline/TimelineGutterRow";
import { TimelineBar } from "../../TraceTimeline/TimelineBar";
import { TimelineScale } from "../../TraceTimeline/TimelineScale";
import {
  SCALE_WIDTH,
  calculateStepSize,
} from "../../TraceTimeline/timeline-calculations";
import {
  flattenMock,
  MOCK_PARENT_TOTAL_COST,
  MOCK_ROOTS,
  MOCK_TRACE_DURATION,
} from "./mockTrace";

export const DENSE_ROW = 26;
const TIMELINE_GUTTER_W = 196;
const CHART_PAD = 280;
const STEP_SIZE = calculateStepSize(MOCK_TRACE_DURATION, SCALE_WIDTH);

// ---------------------------------------------------------------------------
// node lookup (DetailPane content keys off the selected node)
// ---------------------------------------------------------------------------
const NODE_MAP = new Map<string, TreeNode>();
(function walk(nodes: TreeNode[]) {
  for (const n of nodes) {
    NODE_MAP.set(n.id, n);
    if (n.children.length) walk(n.children);
  }
})(MOCK_ROOTS);

export type View = "tree" | "timeline";

// ---------------------------------------------------------------------------
// hooks
// ---------------------------------------------------------------------------

/** Measure a container so a take can adapt its layout to the available width. */
export function useContainerWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** Pointer-drag resize for a px size along one axis, clamped to [min, max]. */
export function useDragResize(opts: {
  axis: "x" | "y";
  size: number;
  setSize: (n: number) => void;
  min: number;
  max: number;
  /** Drag direction: -1 flips it (e.g. a handle on the pane's right edge). */
  sign?: 1 | -1;
}) {
  const { axis, size, setSize, min, max, sign = 1 } = opts;
  return useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const start = axis === "x" ? e.clientX : e.clientY;
      const startSize = size;
      const onMove = (ev: PointerEvent) => {
        const cur = axis === "x" ? ev.clientX : ev.clientY;
        const next = startSize + sign * (cur - start);
        setSize(Math.min(max, Math.max(min, next)));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [axis, size, setSize, min, max, sign],
  );
}

// ---------------------------------------------------------------------------
// small controls
// ---------------------------------------------------------------------------

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  size?: "sm" | "xs";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-muted inline-flex shrink-0 items-center gap-0.5 rounded-md p-0.5",
        className,
      )}
      role="tablist"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1 rounded font-medium transition-colors",
              size === "xs" ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-xs",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function IconBtn({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Star;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(active && "text-yellow-500")}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}

/** A divider with a wide invisible grab strip + double-click reset. */
export function ResizeDivider({
  orientation,
  onPointerDown,
  onReset,
  title = "Resize · double-click to reset",
}: {
  orientation: "vertical" | "horizontal";
  onPointerDown: (e: React.PointerEvent) => void;
  onReset?: () => void;
  title?: string;
}) {
  const vertical = orientation === "vertical";
  return (
    <div
      className={cn("bg-border relative shrink-0", vertical ? "w-px" : "h-px")}
    >
      <div
        role="separator"
        aria-orientation={orientation}
        aria-label={title}
        title={title}
        onPointerDown={onPointerDown}
        onDoubleClick={onReset}
        className={cn(
          "hover:bg-primary/40 active:bg-primary/40 absolute z-20",
          vertical
            ? "inset-y-0 left-1/2 w-2 -translate-x-1/2 cursor-col-resize"
            : "inset-x-0 top-1/2 h-2 -translate-y-1/2 cursor-row-resize",
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// NavPane — tree / timeline, with a toolbar (search · view switch · actions)
// ---------------------------------------------------------------------------

function NavToolbar({
  view,
  onViewChange,
  leading,
  trailing,
}: {
  view: View;
  onViewChange: (v: View) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5">
      {leading}
      <div className="text-muted-foreground bg-muted/40 flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-xs">Search trace…</span>
      </div>
      <SegmentedControl
        value={view}
        onChange={onViewChange}
        options={[
          { value: "tree", label: "Tree", title: "Tree view" },
          { value: "timeline", label: "Timeline", title: "Timeline view" },
        ]}
      />
      <Button variant="ghost" size="icon-xs" title="View settings">
        <Settings2 className="h-3.5 w-3.5" />
      </Button>
      {trailing}
    </div>
  );
}

function TreePaneBody({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const items = flattenMock(collapsed);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  return (
    <div
      className="min-h-0 flex-1 overflow-auto"
      onMouseLeave={() => setHovered(null)}
    >
      {items.map((item) => (
        <div key={item.node.id} style={{ height: DENSE_ROW }}>
          <TimelineGutterRow
            item={item}
            isSelected={selectedId === item.node.id}
            isHovered={hovered === item.node.id}
            onSelect={() => onSelect(item.node.id)}
            onHover={() => setHovered(item.node.id)}
            onToggleCollapse={() => toggle(item.node.id)}
            hasChildren={item.node.children.length > 0}
            isCollapsed={collapsed.has(item.node.id)}
          />
        </div>
      ))}
    </div>
  );
}

function TimelinePaneBody({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [collapsed] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const items = flattenMock(collapsed);
  const chartWidth = SCALE_WIDTH + CHART_PAD;

  return (
    <div
      className="flex min-h-0 flex-1 overflow-y-auto"
      onMouseLeave={() => setHovered(null)}
    >
      {/* Name gutter (no horizontal scroll). */}
      <div className="shrink-0 border-r" style={{ width: TIMELINE_GUTTER_W }}>
        <div className="bg-background text-muted-foreground sticky top-0 z-10 flex h-10 items-end border-b px-2 pb-1 text-xs font-medium">
          Name
        </div>
        {items.map((item) => (
          <div key={item.node.id} style={{ height: DENSE_ROW }}>
            <TimelineGutterRow
              item={item}
              isSelected={selectedId === item.node.id}
              isHovered={hovered === item.node.id}
              onSelect={() => onSelect(item.node.id)}
              onHover={() => setHovered(item.node.id)}
              onToggleCollapse={() => undefined}
              hasChildren={item.node.children.length > 0}
              isCollapsed={false}
            />
          </div>
        ))}
      </div>
      {/* Chart (owns the only horizontal scrollbar). */}
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div style={{ width: chartWidth }}>
          <div className="bg-background sticky top-0 z-10 h-10 border-b">
            <TimelineScale
              traceDuration={MOCK_TRACE_DURATION}
              scaleWidth={SCALE_WIDTH}
              stepSize={STEP_SIZE}
            />
          </div>
          {items.map((item) => {
            const isSelected = selectedId === item.node.id;
            const isHovered = hovered === item.node.id;
            return (
              <div
                key={item.node.id}
                style={{ height: DENSE_ROW }}
                className={cn(
                  "relative cursor-pointer",
                  isSelected
                    ? "bg-primary-accent/10"
                    : isHovered
                      ? "bg-muted"
                      : "",
                )}
                onClick={() => onSelect(item.node.id)}
                onMouseEnter={() => setHovered(item.node.id)}
              >
                <TimelineBar
                  node={item.node}
                  metrics={item.metrics}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  showDuration
                  showCostTokens
                  showScores={false}
                  showComments={false}
                  colorCodeMetrics={false}
                  parentTotalCost={MOCK_PARENT_TOTAL_COST}
                  parentTotalDuration={MOCK_TRACE_DURATION}
                  scores={[]}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function NavPane({
  view,
  onViewChange,
  selectedId,
  onSelect,
  leading,
  trailing,
  className,
}: {
  view: View;
  onViewChange: (v: View) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("bg-background flex h-full min-h-0 flex-col", className)}
    >
      <NavToolbar
        view={view}
        onViewChange={onViewChange}
        leading={leading}
        trailing={trailing}
      />
      {view === "tree" ? (
        <TreePaneBody selectedId={selectedId} onSelect={onSelect} />
      ) : (
        <TimelinePaneBody selectedId={selectedId} onSelect={onSelect} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DetailPane — header (badge · name · actions) + tabs + mock body
// ---------------------------------------------------------------------------

type DetailTab = "preview" | "log" | "scores";

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
        {label}
      </div>
      <div className="text-foreground truncate text-xs font-medium">
        {value}
      </div>
    </div>
  );
}

function IoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="bg-muted/50 text-muted-foreground border-b px-2.5 py-1 text-[11px] font-medium">
        {title}
      </div>
      <pre className="text-foreground/80 max-h-40 overflow-auto px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
        {body}
      </pre>
    </div>
  );
}

export function DetailPane({
  nodeId,
  headerControl,
  className,
}: {
  nodeId: string | null;
  headerControl?: ReactNode;
  className?: string;
}) {
  const [tab, setTab] = useState<DetailTab>("preview");
  const [starred, setStarred] = useState(false);
  const node = nodeId ? NODE_MAP.get(nodeId) : undefined;

  if (!node) {
    return (
      <div
        className={cn(
          "text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm",
          className,
        )}
      >
        Select a node to see its details.
      </div>
    );
  }

  const isGen = node.type === "GENERATION";
  return (
    <div
      className={cn("bg-background flex h-full min-h-0 flex-col", className)}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <div className="shrink-0">
          <ItemBadge type={node.type} isSmall />
        </div>
        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
          {node.name}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn
            icon={Star}
            label={starred ? "Remove bookmark" : "Bookmark"}
            active={starred}
            onClick={() => setStarred((s) => !s)}
          />
          <IconBtn icon={Copy} label="Copy ID" />
          <IconBtn icon={Share2} label="Share" />
          <IconBtn icon={Trash2} label="Delete" />
          {headerControl}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "preview", label: "Preview" },
            { value: "log", label: "Log" },
            { value: "scores", label: "Scores" },
          ]}
        />
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {tab === "preview" && (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <MetaItem label="Type" value={node.type} />
              <MetaItem
                label="Latency"
                value={node.latency ? `${node.latency.toFixed(2)}s` : "—"}
              />
              <MetaItem
                label="Cost"
                value={node.totalCost ? `$${node.totalCost.toFixed(4)}` : "—"}
              />
              {isGen && <MetaItem label="Model" value="claude-opus-4" />}
              {isGen && <MetaItem label="Tokens" value="1,284 → 412" />}
              <MetaItem label="Start" value="+1.20s" />
            </div>
            <IoCard
              title="Input"
              body={
                isGen
                  ? `[\n  { "role": "system", "content": "You are a helpful support agent." },\n  { "role": "user", "content": "Where is my order #4837?" }\n]`
                  : `{\n  "query": "${node.name}",\n  "depth": ${node.depth}\n}`
              }
            />
            <IoCard
              title="Output"
              body={
                isGen
                  ? `Your order #4837 shipped this morning and is expected to\narrive within 2 business days. Here is the tracking link…`
                  : `{\n  "status": "ok",\n  "items": 12\n}`
              }
            />
          </>
        )}
        {tab === "log" && (
          <div className="space-y-1 font-mono text-[11px]">
            {[
              "12:00:00.180  INFO   span.start  draft-plan",
              "12:00:01.020  DEBUG  retriever   2,142 candidates",
              "12:00:02.400  INFO   generation  first token",
              "12:00:09.000  INFO   span.end    ok",
            ].map((l) => (
              <div key={l} className="text-foreground/80 truncate">
                {l}
              </div>
            ))}
          </div>
        )}
        {tab === "scores" && (
          <div className="flex flex-wrap gap-2">
            {[
              ["helpfulness", "0.92"],
              ["hallucination", "false"],
              ["tone", "friendly"],
            ].map(([k, v]) => (
              <span
                key={k}
                className="bg-muted text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
              >
                <span className="text-muted-foreground">{k}</span>
                <span className="font-medium">{v}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
