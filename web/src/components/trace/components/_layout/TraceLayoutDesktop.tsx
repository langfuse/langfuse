import { StringParam, useQueryParam } from "use-query-params";
import {
  Group,
  Separator,
  Panel,
  usePanelRef,
  useGroupRef,
  useDefaultLayout,
  type PanelImperativeHandle,
} from "react-resizable-panels";
import {
  useState,
  useEffect,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { PanelRightOpen } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { useViewPreferences } from "@/src/components/trace/contexts/ViewPreferencesContext";
import { useSelection } from "@/src/components/trace/contexts/SelectionContext";

// v2: the default split now gives the trace (tree/timeline) the central space
// with a slimmer detail panel. Bumped so a stale saved layout doesn't mask it.
const RESIZABLE_PANEL_GROUP_ID = "trace-layout-v2";
const RESIZABLE_PANEL_HANDLE_ID = "trace-layout-handle";
const RESIZABLE_PANEL_NAVIGATION_ID = "trace-layout-panel-navigation";
const RESIZABLE_PANEL_PREVIEW_ID = "trace-layout-panel-preview";

// Min widths of the two collapsible panels (kept here so the Panel props and the
// toggle/scroll logic below can't drift apart).
//
// react-resizable-panels is percentage-based and its constraint solver refuses
// to shrink a panel below its min. In a narrow peek the container can be too
// small to satisfy BOTH mins at once. The previous fix (LFE-10547) reacted by
// force-collapsing the opposite panel so only one was ever open when narrow —
// too radical: users want both panels open at once.
//
// Instead we let BOTH panels stay open at their mins and make the peek scroll
// horizontally: when both are open we pin the panel group to a min-width equal
// to the sum of the mins (plus the 1px handle) inside an `overflow-x-auto`
// wrapper. The library measures the group from its panels' own widths, so it
// sees enough room for both mins and never collapses one — the overflow simply
// scrolls. When either panel is collapsed the pin is dropped so the open panel
// fills the available width as usual.
const NAVIGATION_PANEL_MIN_PX = 260;
const DETAIL_PANEL_MIN_PX = 360;
const RESIZE_HANDLE_PX = 1;
const COLLAPSED_PANEL_PX = 40;
// Width below which the two mins can't both fit; at-or-above this the group
// fills the container normally, below it the group keeps this width and the
// wrapper scrolls horizontally.
const BOTH_PANELS_MIN_WIDTH_PX =
  NAVIGATION_PANEL_MIN_PX + DETAIL_PANEL_MIN_PX + RESIZE_HANDLE_PX;

// Detect whether a panel is sitting on its collapsed rail in a RESTORED layout.
// `useDefaultLayout` returns a `{ [panelId]: number }` map of flexGrow shares
// that sum to ~100 (percentages of the group). A collapsed panel is exactly its
// `collapsedSize` (40px) wide, while an open panel is always at least its
// `minSize` (260/360px). For any peek width those two ranges never overlap: at
// the narrowest both-panels-open width (~621px) the 40px rail is ~6% while the
// smaller open min (nav 260px) is ~42%, and the gap only widens as the group
// grows. We therefore treat a panel as collapsed-in-layout when its restored
// share is at most the share its rail would occupy at the narrowest open width,
// with a margin — comfortably below any open-min share. Used only to seed the
// collapse flags on mount so `bothPanelsOpen` (and thus the min-width pin)
// matches the layout the library is about to restore, avoiding a one-frame
// scrollbar flash (see the useState initializers below).
const COLLAPSED_LAYOUT_SHARE_MAX_PCT =
  ((COLLAPSED_PANEL_PX / BOTH_PANELS_MIN_WIDTH_PX) * 100 +
    (NAVIGATION_PANEL_MIN_PX / BOTH_PANELS_MIN_WIDTH_PX) * 100) /
  2;
function isPanelCollapsedInLayout(
  layout: Record<string, number> | undefined,
  panelId: string,
): boolean {
  const share = layout?.[panelId];
  return typeof share === "number" && share <= COLLAPSED_LAYOUT_SHARE_MAX_PCT;
}

// Context for sharing panel state with compound components
interface TraceLayoutDesktopContext {
  isNavigationPanelCollapsed: boolean;
  setIsNavigationPanelCollapsed: (collapsed: boolean) => void;
  panelRef: React.RefObject<PanelImperativeHandle | null>;
  handleTogglePanel: () => void;
  shouldPulseToggle: boolean;
  // Detail (info/preview) panel — collapsible like the navigation panel.
  detailPanelRef: React.RefObject<PanelImperativeHandle | null>;
  isDetailPanelCollapsed: boolean;
  setIsDetailPanelCollapsed: (collapsed: boolean) => void;
  expandDetailPanel: () => void;
}

const LayoutContext = createContext<TraceLayoutDesktopContext | null>(null);

function useLayoutContext() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error(
      "TraceLayoutDesktop compound components must be used within TraceLayoutDesktop",
    );
  }
  return context;
}

// Export hook for use in Trace.tsx
export function useDesktopLayoutContext() {
  return useLayoutContext();
}

// Safe variant for components rendered in both desktop and mobile layouts
// (mobile has no provider): returns null instead of throwing.
export function useDesktopLayoutContextOptional() {
  return useContext(LayoutContext);
}

export function TraceLayoutDesktop({ children }: { children: ReactNode }) {
  // Get current view mode from URL
  const [viewMode] = useQueryParam("view", StringParam);
  const isTimelineView = viewMode === "timeline";

  // Get annotation mode from context to determine initial collapse state
  const { isAnnotationMode } = useViewPreferences();

  // Restored (sessionStorage) layout for this group. Read before the collapse
  // flags so we can seed them from what the library is about to restore on
  // mount — otherwise the first render derives `bothPanelsOpen` purely from the
  // useState defaults (open), pins the group to 621px even when a persisted
  // layout has a panel on its 40px rail, and a narrow peek flashes a useless
  // horizontal scrollbar until the Panel's onResize corrects the flag a frame
  // later.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: RESIZABLE_PANEL_GROUP_ID,
    panelIds: [RESIZABLE_PANEL_NAVIGATION_ID, RESIZABLE_PANEL_PREVIEW_ID],
    storage: sessionStorage,
  });

  const [isNavigationPanelCollapsed, setIsNavigationPanelCollapsed] = useState(
    () =>
      isAnnotationMode ||
      isPanelCollapsedInLayout(defaultLayout, RESIZABLE_PANEL_NAVIGATION_ID),
  );

  // Ref to programmatically control the panel
  const panelRef = usePanelRef();

  // Detail (info/preview) panel collapse state + control.
  const detailPanelRef = usePanelRef();
  const [isDetailPanelCollapsed, setIsDetailPanelCollapsed] = useState(() =>
    isPanelCollapsedInLayout(defaultLayout, RESIZABLE_PANEL_PREVIEW_ID),
  );

  // Group ref — drives the whole layout atomically (setLayout) when reopening a
  // collapsed panel, which is more robust than chaining the per-panel
  // expand()+resize() imperatives (those validate against a momentarily stale
  // store and silently no-op on a narrow peek).
  const groupRef = useGroupRef();

  // Which collapsed panel a click asked to open, awaiting room. We pin the group
  // (below) for it, let React commit the wider min-width to the DOM, then run
  // the actual expand from the effect — so the solver has room for both mins.
  // Without this, expanding while the peek is too narrow for both mins is a
  // silent no-op: the group stays at its current width and the solver refuses to
  // shrink the open panel below its min (the original LFE-10547 symptom).
  const [pendingExpand, setPendingExpand] = useState<
    "navigation" | "detail" | null
  >(null);

  // Both panels open (neither collapsed) — drives the min-width pin on the group
  // so a too-narrow peek scrolls horizontally instead of force-collapsing one.
  // When either is collapsed the pin is dropped so the open panel fills the
  // width. Mirrors the two collapse flags (kept in sync by each Panel's
  // onResize) rather than reading the refs, so it re-renders the group; a
  // `pendingExpand` keeps the pin on while a click's expand is in flight.
  const bothPanelsOpen =
    pendingExpand !== null ||
    (!isNavigationPanelCollapsed && !isDetailPanelCollapsed);

  // Reopen the queued panel once the pin's wider min-width has taken effect.
  //
  // Subtlety: setting `pendingExpand` commits `min-width: <sum of mins>` to the
  // GROUP element, growing it so there's room for both mins (the wrapper
  // scrolls). But react-resizable-panels derives its internal group size from
  // the summed widths of its panels, and only recomputes that when its own
  // ResizeObserver notices the group element grew — which is delivered a couple
  // of frames later. Until then the library still thinks the group is the old
  // (too-narrow) width, so expanding clamps the panel straight back to its
  // collapsed rail (the silent no-op behind LFE-10547). We therefore defer the
  // reopen across two animation frames, by which point the observer has fired
  // and the library sees the full width.
  //
  // expand() alone can also land on a degenerate size (LFE-10550): it restores
  // the panel's pre-collapse size, which may swallow the whole peek or sit below
  // its min. So after expanding we set the whole layout explicitly to a balanced
  // split that still leaves the sibling its min — groupWidth/2 clamped to
  // [own min, groupWidth − sibling min]. On a too-narrow peek the upper clamp
  // wins: the panel lands on its own min and the sibling keeps its min (both at
  // mins + horizontal scroll); on a wide peek it's a true 50/50.
  useEffect(() => {
    if (!pendingExpand) return;
    const target = pendingExpand;
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => {
        const group = groupRef.current;
        const panel =
          target === "navigation" ? panelRef.current : detailPanelRef.current;
        const siblingPanel =
          target === "navigation" ? detailPanelRef.current : panelRef.current;
        const groupWidthPx =
          document.getElementById(RESIZABLE_PANEL_GROUP_ID)?.offsetWidth ?? 0;
        if (group && panel && groupWidthPx > 0) {
          // Whether the sibling was deliberately collapsed (header toggle, rail
          // button, or dragged onto its 40px rail). If so we keep it there:
          // collapsing stays a manual action, so reopening one panel must not
          // silently uncollapse the other (LFE-10550). Captured before expand().
          const siblingCollapsed = siblingPanel?.isCollapsed() ?? false;
          panel.expand();
          const ownMinPx =
            target === "navigation"
              ? NAVIGATION_PANEL_MIN_PX
              : DETAIL_PANEL_MIN_PX;
          const siblingMinPx =
            target === "navigation"
              ? DETAIL_PANEL_MIN_PX
              : NAVIGATION_PANEL_MIN_PX;
          if (siblingCollapsed) {
            // Sibling stays on its rail: give the target everything except the
            // sibling's 40px rail. resize() (not the two-panel setLayout) leaves
            // the collapsed sibling untouched so its onResize never fires.
            const ownPx = Math.max(ownMinPx, groupWidthPx - COLLAPSED_PANEL_PX);
            panel.resize(`${(ownPx / groupWidthPx) * 100}%`);
          } else {
            // Both open: balanced split that still leaves the sibling its min —
            // groupWidth/2 clamped to [own min, groupWidth − sibling min]. On a
            // too-narrow peek the upper clamp wins: target lands on its own min,
            // sibling keeps its min (both at mins + horizontal scroll); on a wide
            // peek it's a true 50/50.
            const ownPx = Math.max(
              ownMinPx,
              Math.min(groupWidthPx / 2, groupWidthPx - siblingMinPx),
            );
            const ownPercent = (ownPx / groupWidthPx) * 100;
            group.setLayout({
              [RESIZABLE_PANEL_NAVIGATION_ID]:
                target === "navigation" ? ownPercent : 100 - ownPercent,
              [RESIZABLE_PANEL_PREVIEW_ID]:
                target === "detail" ? ownPercent : 100 - ownPercent,
            });
          }
          // Only update state when the expand actually applied (inside the
          // guard) — otherwise the flags would flip to "open" while the library
          // still has the panel collapsed, desyncing the min-width pin until the
          // next onResize. Flip the target's flag before clearing pendingExpand
          // so the group stays pinned across the render that clears the intent
          // (otherwise it would briefly unpin and the solver could re-collapse
          // the panel we just opened). The sibling's flag is left to its own
          // onResize: when it stays collapsed nothing fires and the flag holds.
          if (target === "navigation") setIsNavigationPanelCollapsed(false);
          else setIsDetailPanelCollapsed(false);
        }
        // Always clear the transient intent — even on a failed expand — so a
        // later resize/onResize isn't blocked by a stale pendingExpand.
        setPendingExpand(null);
      });
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExpand]);

  // Guarded so it's a no-op (not a resize) when already open — safe to call on
  // every row click, which is how re-selecting the same node reopens it.
  const expandDetailPanel = () => {
    if (!detailPanelRef.current?.isCollapsed()) return;
    setPendingExpand("detail");
  };

  // Selecting another node (timeline/tree) while the detail panel is collapsed
  // reopens it. This covers selection CHANGES (incl. the search list); re-
  // selecting the same node is handled at the row click via expandDetailPanel,
  // since the URL param — and thus this effect — doesn't change on re-click.
  const { selectedNodeId } = useSelection();
  useEffect(() => {
    // Guard on selectedNodeId so a deliberately-collapsed panel isn't reopened
    // on mount/refresh when there's no selection (effects always run once).
    if (selectedNodeId) expandDetailPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  // Collapse panel on initial mount if in annotation mode
  useEffect(() => {
    if (
      isAnnotationMode &&
      panelRef.current &&
      !panelRef.current.isCollapsed()
    ) {
      panelRef.current.collapse();
      setIsNavigationPanelCollapsed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual toggle for the navigation panel (header button + handle double-click).
  // Collapse stays fully manual; expanding restores a balanced size so the nav
  // panel never swallows the whole peek, and both panels can be open at once —
  // a too-narrow peek scrolls horizontally rather than collapsing the detail
  // panel (LFE-10550).
  const handleTogglePanel = () => {
    if (!panelRef.current) return;

    if (panelRef.current.isCollapsed()) {
      setPendingExpand("navigation");
    } else {
      panelRef.current.collapse();
    }
  };

  // Pulse animation: hint to user that panel can be collapsed when switching to timeline
  const [shouldPulseToggle, setShouldPulseToggle] = useState(false);

  useEffect(() => {
    if (isTimelineView) {
      setShouldPulseToggle(true);
      const timeout = setTimeout(() => {
        setShouldPulseToggle(false);
      }, 12000); // Stop pulse after 12 seconds
      return () => clearTimeout(timeout);
    }
    // Reset pulse when leaving timeline view
    setShouldPulseToggle(false);
  }, [isTimelineView]);

  const contextValue: TraceLayoutDesktopContext = {
    isNavigationPanelCollapsed,
    setIsNavigationPanelCollapsed,
    panelRef,
    handleTogglePanel,
    shouldPulseToggle,
    detailPanelRef,
    isDetailPanelCollapsed,
    setIsDetailPanelCollapsed,
    expandDetailPanel,
  };

  return (
    <LayoutContext.Provider value={contextValue}>
      {/* Horizontal-scroll wrapper: when both panels are open we pin the panel
          group to the sum of the two mins so a peek too narrow for both keeps
          them at their mins and scrolls horizontally instead of force-collapsing
          one (LFE-10550). The library can't override `width`/`min-width` on the
          group's own style, so the pin lives there; the wrapper owns the scroll.
          When either panel is collapsed there's no pin and the group fills the
          width (`min-w-0`) as before. */}
      <div className="relative h-full w-full overflow-x-auto overflow-y-hidden">
        <Group
          orientation="horizontal"
          id={RESIZABLE_PANEL_GROUP_ID}
          groupRef={groupRef}
          defaultLayout={defaultLayout}
          onLayoutChanged={isAnnotationMode ? undefined : onLayoutChanged}
          className={bothPanelsOpen ? undefined : "min-w-0"}
          style={
            bothPanelsOpen
              ? { minWidth: `${BOTH_PANELS_MIN_WIDTH_PX}px` }
              : undefined
          }
        >
          {children}
        </Group>
        {/* When the detail panel is collapsed it renders its own collapsed rail
            with a "Show detail panel" button (see DetailPanel below) — the
            navigation header carries no re-open button, and there's no floating
            edge tab. */}
      </div>
    </LayoutContext.Provider>
  );
}

// Compound component: Navigation panel
TraceLayoutDesktop.NavigationPanel = function Navigation({
  children,
}: {
  children: ReactNode;
}) {
  const { setIsNavigationPanelCollapsed, panelRef } = useLayoutContext();

  return (
    <Panel
      id={RESIZABLE_PANEL_NAVIGATION_ID}
      panelRef={panelRef}
      collapsible={true}
      collapsedSize="40px"
      minSize={`${NAVIGATION_PANEL_MIN_PX}px`}
      defaultSize="60%"
      onResize={() => {
        setIsNavigationPanelCollapsed(panelRef.current?.isCollapsed() ?? false);
      }}
    >
      {children}
    </Panel>
  );
};

// Compound component: Resize handle
TraceLayoutDesktop.ResizeHandle = function ResizeHandle() {
  const { handleTogglePanel } = useLayoutContext();

  return (
    <Separator
      id={RESIZABLE_PANEL_HANDLE_ID}
      className="bg-border relative w-px transition-colors duration-200 after:absolute after:inset-y-0 after:left-0 after:w-1 after:bg-blue-200 after:opacity-0 after:transition-opacity after:duration-200 hover:after:opacity-100 active:after:opacity-100"
      onDoubleClick={handleTogglePanel}
    />
  );
};

// Compound component: Detail panel
TraceLayoutDesktop.DetailPanel = function Detail({
  children,
}: {
  children: ReactNode;
}) {
  const {
    detailPanelRef,
    setIsDetailPanelCollapsed,
    isDetailPanelCollapsed,
    expandDetailPanel,
  } = useLayoutContext();

  return (
    // Collapsible like the navigation panel: dragging it below the 360px floor
    // snaps it to a 40px rail (collapsedSize) so the timeline/tree takes the
    // rest of the width while a "show detail panel" button on the rail brings it
    // back — mirroring the navigation panel's collapsed strip. 360px is the
    // readable minimum the narrow peek already renders at.
    <Panel
      id={RESIZABLE_PANEL_PREVIEW_ID}
      panelRef={detailPanelRef}
      defaultSize="40%"
      collapsible={true}
      collapsedSize="40px"
      minSize={`${DETAIL_PANEL_MIN_PX}px`}
      onResize={() => {
        setIsDetailPanelCollapsed(
          detailPanelRef.current?.isCollapsed() ?? false,
        );
      }}
    >
      {/* Keep the detail content MOUNTED while collapsed (just hidden), so its
          scroll position, local state, and in-progress comment/annotation
          drafts survive a collapse → expand round-trip. */}
      <div className={cn("h-full w-full", isDetailPanelCollapsed && "hidden")}>
        {children}
      </div>
      {isDetailPanelCollapsed && (
        <div className="flex h-full w-full flex-col items-center p-2">
          <Button
            variant="ghost"
            size="icon"
            title="Show detail panel"
            aria-label="Show detail panel"
            onClick={expandDetailPanel}
            className="h-7 w-7 shrink-0"
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </Panel>
  );
};
