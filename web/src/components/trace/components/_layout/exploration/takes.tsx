/**
 * The four double-panel layout TAKES (Phase 0 exploration).
 *
 * Each take is a genuinely different STRUCTURE answering the same three
 * questions — how do you show just-the-tree / just-the-detail / both, and how do
 * you resize & swap — at any width (desktop · narrow peek · mobile). They share
 * the same NavPane + DetailPane (parts.tsx) so only the arrangement differs.
 *
 *  A · Position Switcher  — Sentry-style: choose the detail pane's position
 *                           (right / bottom) + a Tree·Split·Detail visibility
 *                           toggle. Resizable, double-click reset.
 *  B · Icon Rail          — today's left/right split, but collapsing a pane
 *                           leaves an informative icon RAIL (not a bare tab).
 *  C · Segmented Mode     — one obvious control: [ Tree | Both | Detail ].
 *                           "Both" auto-stacks when the container gets narrow.
 *  D · Adaptive Overlay   — width-driven: side-by-side when wide; a sliding
 *                           master→detail overlay when narrow / mobile.
 */

import { useRef, useState } from "react";
import {
  ArrowLeft,
  Columns2,
  ListTree,
  PanelBottom,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  Rows3,
  Search,
} from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import { ItemBadge } from "@/src/components/ItemBadge";
import { type TreeNode } from "../../../lib/types";
import { MOCK_ROOTS } from "./mockTrace";
import {
  DetailPane,
  NavPane,
  ResizeDivider,
  SegmentedControl,
  useContainerWidth,
  useDragResize,
  type View,
} from "./parts";

const DEFAULT_SELECTED = "answer-llm";

/** Shared per-take state: which view the nav shows + which node is selected. */
function useExplorationState() {
  // Tree is the app's default view; the dense Timeline waterfall is one click
  // away (and reveals the width tension — a wide waterfall in a narrow pane —
  // that the position/visibility controls are there to relieve).
  const [view, setView] = useState<View>("tree");
  const [selectedId, setSelectedId] = useState<string | null>(DEFAULT_SELECTED);
  return { view, setView, selectedId, setSelectedId };
}

// tiny lookup so a collapsed detail rail can show the selected node's badge
const FLAT_TYPES = new Map<string, TreeNode["type"]>();
(function walk(ns: TreeNode[]) {
  for (const n of ns) {
    FLAT_TYPES.set(n.id, n.type);
    if (n.children.length) walk(n.children);
  }
})(MOCK_ROOTS);
function nodeTypeFor(id: string): TreeNode["type"] {
  return FLAT_TYPES.get(id) ?? "SPAN";
}

// ===========================================================================
// A · Position Switcher
// ===========================================================================

type DetailPos = "right" | "bottom";
type Visibility = "tree" | "split" | "detail";

export function TakePositionSwitcher() {
  const { view, setView, selectedId, setSelectedId } = useExplorationState();
  const [pos, setPos] = useState<DetailPos>("right");
  const [vis, setVis] = useState<Visibility>("split");
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);

  const [navW, setNavW] = useState(360);
  const [detailH, setDetailH] = useState(300);
  const navResize = useDragResize({
    axis: "x",
    size: navW,
    setSize: setNavW,
    min: 240,
    max: Math.max(280, width - 320),
  });
  const detailResize = useDragResize({
    axis: "y",
    size: detailH,
    setSize: setDetailH,
    min: 160,
    max: 560,
    sign: -1,
  });

  const nav = (
    <NavPane
      view={view}
      onViewChange={setView}
      selectedId={selectedId}
      onSelect={setSelectedId}
    />
  );
  const detail = <DetailPane nodeId={selectedId} />;

  return (
    <div className="flex h-full flex-col">
      {/* Arranger strip: governs the whole layout (not just one pane). */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1.5">
        <SegmentedControl
          value={vis}
          onChange={setVis}
          options={[
            { value: "tree", label: "Tree" },
            { value: "split", label: "Split" },
            { value: "detail", label: "Detail" },
          ]}
        />
        <SegmentedControl
          value={pos}
          onChange={setPos}
          size="xs"
          options={[
            {
              value: "right",
              label: <PanelRight className="h-3.5 w-3.5" />,
              title: "Detail on the right",
            },
            {
              value: "bottom",
              label: <PanelBottom className="h-3.5 w-3.5" />,
              title: "Detail on the bottom",
            },
          ]}
        />
      </div>

      <div ref={containerRef} className="min-h-0 flex-1">
        {vis === "tree" && <div className="h-full">{nav}</div>}
        {vis === "detail" && <div className="h-full">{detail}</div>}
        {vis === "split" && pos === "right" && (
          <div className="flex h-full min-h-0">
            <div style={{ width: navW }} className="min-w-0 shrink-0">
              {nav}
            </div>
            <ResizeDivider
              orientation="vertical"
              onPointerDown={navResize}
              onReset={() => setNavW(360)}
            />
            <div className="min-w-0 flex-1">{detail}</div>
          </div>
        )}
        {vis === "split" && pos === "bottom" && (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">{nav}</div>
            <ResizeDivider
              orientation="horizontal"
              onPointerDown={detailResize}
              onReset={() => setDetailH(300)}
            />
            <div style={{ height: detailH }} className="shrink-0">
              {detail}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// B · Icon Rail
// ===========================================================================

function Rail({
  side,
  children,
}: {
  side: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-muted/30 flex w-11 shrink-0 flex-col items-center gap-1 py-2",
        side === "left" ? "border-r" : "border-l",
      )}
    >
      {children}
    </div>
  );
}

function RailBtn({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof ListTree;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "h-8 w-8",
        active && "bg-background text-foreground shadow-sm",
      )}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

export function TakeIconRail({
  initialNavCollapsed = false,
  initialDetailCollapsed = false,
}: {
  initialNavCollapsed?: boolean;
  initialDetailCollapsed?: boolean;
} = {}) {
  const { view, setView, selectedId, setSelectedId } = useExplorationState();
  const [navCollapsed, setNavCollapsed] = useState(initialNavCollapsed);
  const [detailCollapsed, setDetailCollapsed] = useState(
    initialDetailCollapsed,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const [navW, setNavW] = useState(340);
  const navResize = useDragResize({
    axis: "x",
    size: navW,
    setSize: setNavW,
    min: 240,
    max: Math.max(280, width - 320),
  });

  const selectedNode = selectedId;

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      {navCollapsed ? (
        <Rail side="left">
          <RailBtn
            icon={PanelLeftOpen}
            label="Show navigation"
            onClick={() => setNavCollapsed(false)}
          />
          <div className="bg-border my-1 h-px w-5" />
          <RailBtn
            icon={ListTree}
            label="Tree view"
            active={view === "tree"}
            onClick={() => {
              setView("tree");
              setNavCollapsed(false);
            }}
          />
          <RailBtn
            icon={Columns2}
            label="Timeline view"
            active={view === "timeline"}
            onClick={() => {
              setView("timeline");
              setNavCollapsed(false);
            }}
          />
          <RailBtn
            icon={Search}
            label="Search"
            onClick={() => setNavCollapsed(false)}
          />
        </Rail>
      ) : (
        <>
          <div style={{ width: navW }} className="min-w-0 shrink-0">
            <NavPane
              view={view}
              onViewChange={setView}
              selectedId={selectedId}
              onSelect={setSelectedId}
              trailing={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Collapse navigation"
                  aria-label="Collapse navigation"
                  onClick={() => setNavCollapsed(true)}
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              }
            />
          </div>
          {!detailCollapsed && (
            <ResizeDivider
              orientation="vertical"
              onPointerDown={navResize}
              onReset={() => setNavW(340)}
            />
          )}
        </>
      )}

      {detailCollapsed ? (
        <Rail side="right">
          <RailBtn
            icon={PanelRightOpen}
            label="Show detail"
            onClick={() => setDetailCollapsed(false)}
          />
          {selectedNode && (
            <div className="mt-1">
              <ItemBadge type={nodeTypeFor(selectedNode)} isSmall />
            </div>
          )}
        </Rail>
      ) : (
        <div className="min-w-0 flex-1">
          <DetailPane
            nodeId={selectedId}
            headerControl={
              <Button
                variant="ghost"
                size="icon-xs"
                title="Collapse detail"
                aria-label="Collapse detail"
                onClick={() => setDetailCollapsed(true)}
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// C · Segmented Mode Switch
// ===========================================================================

type Mode = "tree" | "both" | "detail";

export function TakeSegmentedMode() {
  const { view, setView, selectedId, setSelectedId } = useExplorationState();
  const [mode, setMode] = useState<Mode>("both");
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const stacked = width > 0 && width < 720; // narrow → stack "both" vertically
  const [navW, setNavW] = useState(380);
  const navResize = useDragResize({
    axis: "x",
    size: navW,
    setSize: setNavW,
    min: 260,
    max: Math.max(300, width - 340),
  });

  const nav = (
    <NavPane
      view={view}
      onViewChange={setView}
      selectedId={selectedId}
      onSelect={setSelectedId}
    />
  );
  const detail = <DetailPane nodeId={selectedId} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The single, obvious control. */}
      <div className="flex shrink-0 items-center justify-center border-b px-2 py-1.5">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            {
              value: "tree",
              label: (
                <>
                  <ListTree className="h-3.5 w-3.5" /> Tree
                </>
              ),
            },
            {
              value: "both",
              label: (
                <>
                  {stacked ? (
                    <Rows3 className="h-3.5 w-3.5" />
                  ) : (
                    <Columns2 className="h-3.5 w-3.5" />
                  )}{" "}
                  Both
                </>
              ),
            },
            {
              value: "detail",
              label: (
                <>
                  <PanelRight className="h-3.5 w-3.5" /> Detail
                </>
              ),
            },
          ]}
        />
      </div>

      <div ref={containerRef} className="min-h-0 flex-1">
        {mode === "tree" && <div className="h-full">{nav}</div>}
        {mode === "detail" && <div className="h-full">{detail}</div>}
        {mode === "both" &&
          (stacked ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1">{nav}</div>
              <div className="bg-border h-px" />
              <div className="min-h-0 basis-1/2">{detail}</div>
            </div>
          ) : (
            <div className="flex h-full min-h-0">
              <div style={{ width: navW }} className="min-w-0 shrink-0">
                {nav}
              </div>
              <ResizeDivider
                orientation="vertical"
                onPointerDown={navResize}
                onReset={() => setNavW(380)}
              />
              <div className="min-w-0 flex-1">{detail}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ===========================================================================
// D · Adaptive Overlay
// ===========================================================================

export function TakeAdaptiveOverlay() {
  const { view, setView, selectedId, setSelectedId } = useExplorationState();
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const wide = width === 0 || width >= 900; // default wide before first measure
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [navW, setNavW] = useState(420);
  const navResize = useDragResize({
    axis: "x",
    size: navW,
    setSize: setNavW,
    min: 280,
    max: Math.max(320, width - 380),
  });

  const onSelect = (id: string) => {
    setSelectedId(id);
    if (!wide) setOverlayOpen(true); // narrow: selection slides detail in
  };

  const nav = (
    <NavPane
      view={view}
      onViewChange={setView}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );

  if (wide) {
    return (
      <div ref={containerRef} className="flex h-full min-h-0">
        <div style={{ width: navW }} className="min-w-0 shrink-0">
          {nav}
        </div>
        <ResizeDivider
          orientation="vertical"
          onPointerDown={navResize}
          onReset={() => setNavW(420)}
        />
        <div className="min-w-0 flex-1">
          <DetailPane nodeId={selectedId} />
        </div>
      </div>
    );
  }

  // Narrow / mobile: master list, detail slides over with a Back affordance.
  return (
    <div ref={containerRef} className="relative h-full min-h-0 overflow-hidden">
      <div className="h-full">{nav}</div>
      <div
        className={cn(
          "bg-background absolute inset-0 flex flex-col transition-transform duration-200 ease-out",
          overlayOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => setOverlayOpen(false)}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <span className="text-muted-foreground truncate text-xs">
            Trace navigation
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <DetailPane nodeId={selectedId} />
        </div>
      </div>
    </div>
  );
}
