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
  useMemo,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { PanelRightOpen } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { useViewPreferences } from "@/src/components/trace/contexts/ViewPreferencesContext";
import { useSelection } from "@/src/components/trace/contexts/SelectionContext";
import { resolveEffectiveWidthFraction } from "@/src/components/table/peek/store/peekPanelStore";

// v2: the default split gives the trace (tree/timeline) the central space with a
// slimmer detail panel. Bumped so a stale saved layout doesn't mask it. Used by
// the full-page trace view; the peek uses its own id/storage/default (below).
const RESIZABLE_PANEL_GROUP_ID = "trace-layout-v2";
// Peek gets a distinct group so its computed-percentage default and localStorage
// persistence don't leak into the full-page view (which stays share-based, per
// tab). Same panels, different layout scope (LFE-10601).
const PEEK_RESIZABLE_PANEL_GROUP_ID = "trace-layout-peek-v1";
const RESIZABLE_PANEL_HANDLE_ID = "trace-layout-handle";
const RESIZABLE_PANEL_NAVIGATION_ID = "trace-layout-panel-navigation";
const RESIZABLE_PANEL_PREVIEW_ID = "trace-layout-panel-preview";

// Full-page default (unchanged): a share-based split — tree gets the majority.
const FULL_NAVIGATION_DEFAULT_SIZE = "60%";
const FULL_DETAIL_DEFAULT_SIZE = "40%";

// Peek default split (LFE-10601). We size the tree/timeline (the index) to a
// comfortable band and give the *rest* to the detail panel (the content), so on
// a wide peek the extra width flows to info, not the tree — killing the old
// "very wide tree, cramped info" that the 60/40 share produced on big screens.
//
// We express this as an explicit *percentage* layout computed from the known
// peek width, NOT as a px `defaultSize`. The library converts a px defaultSize
// to a percentage against whatever group width it happens to measure first,
// which on a peek is a transient mid-open value — so the resolved ratio (and
// thus what gets persisted) was non-deterministic. A percentage is
// width-independent, so the default is stable across opens.
const PEEK_INFO_COMFORTABLE_TARGET_PX = 560; // info wants ~this to read JSON/scores
const PEEK_NAV_COMFORTABLE_MIN_PX = 340; // tree's comfortable floor (> the 260 hard min)
const PEEK_NAV_COMFORTABLE_MAX_PX = 460; // never default the tree wider than this

// Tree/info split (as a nav-panel percentage) for a peek of `peekWidthPx`: give
// info its comfortable target, hand the remainder to the tree clamped to its
// comfortable band. Returns undefined when the width is unknown (SSR).
function computePeekNavPercent(peekWidthPx: number): number | undefined {
  if (!(peekWidthPx > 0)) return undefined;
  const navPx = Math.min(
    PEEK_NAV_COMFORTABLE_MAX_PX,
    Math.max(
      PEEK_NAV_COMFORTABLE_MIN_PX,
      peekWidthPx - PEEK_INFO_COMFORTABLE_TARGET_PX,
    ),
  );
  // Keep it a sane share; the panels' own min/collapse constraints do the rest.
  return Math.min(90, Math.max(10, (navPx / peekWidthPx) * 100));
}

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

// A no-op layout storage so `useDefaultLayout` never touches a real Storage
// during SSR / DOM-less tests (its default `= localStorage` is a bare global
// that would throw). Mirrors the pattern in `ui/resizable-split-layout.tsx`.
const NOOP_LAYOUT_STORAGE = {
  getItem: () => null,
  setItem: () => {},
};

// Detect whether a panel is sitting on its collapsed rail in a RESTORED layout.
// `useDefaultLayout` returns a `{ [panelId]: number }` map of flexGrow shares
// that sum to ~100 (percentages of the group). A collapsed panel is exactly its
// `collapsedSize` (40px) wide, while an open panel is always at least its
// `minSize` (260/360px) — or, for the peek's width-capped nav default, ~460px.
// The rail share and the open share never overlap, but WHERE the boundary sits
// depends on the group's actual pixel width: a 460px open nav is ~42% at a 621px
// peek but only ~15% at a 3000px one. So the threshold must be computed against
// the real width, not a fixed percent — otherwise a legitimately-open (but
// small-share) nav on a wide peek is mis-seeded as collapsed and its content
// unmounts for a frame until `onResize` corrects it. Boundary = midpoint between
// the 40px rail and the smallest open min (nav 260px), as a share of the width.
// The boundary is kept LOCAL (not a module const, the #14735 pattern): as a
// single-use top-level const it tripped the SWC prod minifier's dropped-binding
// bug — the declaration was deleted while this function's inlined body kept the
// reference, throwing `ReferenceError` on peek open (LFE-10640; the CI
// client-bundle scan now guards the class, LFE-10645). Delete this workaround
// once swc-project/swc#11983 is fixed in the Next-vendored swc_core.
function collapsedShareMaxForWidth(groupWidthPx: number): number {
  const boundaryPx = (COLLAPSED_PANEL_PX + NAVIGATION_PANEL_MIN_PX) / 2;
  return (boundaryPx / groupWidthPx) * 100;
}
// Full-page fallback (its container width isn't known at seed time): the boundary
// as a share of the narrowest both-open width, matching the prior heuristic.
const COLLAPSED_LAYOUT_SHARE_MAX_PCT = collapsedShareMaxForWidth(
  BOTH_PANELS_MIN_WIDTH_PX,
);
// Used only to seed the collapse flags on mount so `bothPanelsOpen` (and thus
// the min-width pin) matches the layout the library is about to restore,
// avoiding a one-frame scrollbar flash (see the useState initializers below).
function isPanelCollapsedInLayout(
  layout: Record<string, number> | undefined,
  panelId: string,
  maxSharePct: number,
): boolean {
  const share = layout?.[panelId];
  return typeof share === "number" && share <= maxSharePct;
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
  // Fallback panel sizes (peek is driven by the computed-percentage
  // `defaultLayout`; these apply only when it's absent, e.g. the full-page view
  // or SSR). Detail is `undefined` when nav carries the sole default so it
  // auto-fills the remainder.
  navigationDefaultSize: string;
  detailDefaultSize: string | undefined;
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

  // Get annotation mode + peek mode from context. Peek scopes the layout to its
  // own group so its px-anchored default + cross-session persistence stay out of
  // the full-page view (LFE-10601).
  const { isAnnotationMode, isPeekMode } = useViewPreferences();

  const groupId = isPeekMode
    ? PEEK_RESIZABLE_PANEL_GROUP_ID
    : RESIZABLE_PANEL_GROUP_ID;
  // Unify the peek's persistence with its outer width: both live in
  // localStorage, so a resized tree/info ratio sticks across tabs and reloads
  // instead of resetting per tab (the old sessionStorage behavior). The
  // full-page view keeps its per-tab sessionStorage. Guarded so SSR / DOM-less
  // tests fall back to a no-op store instead of throwing on the bare global.
  const storage =
    typeof window === "undefined"
      ? NOOP_LAYOUT_STORAGE
      : isPeekMode
        ? window.localStorage
        : window.sessionStorage;

  // Peek drives its split via an explicit percentage `defaultLayout` (below);
  // the panel `defaultSize`s are the SSR/fallback only. Full-page keeps its
  // share-based 60/40. Detail has no default so it fills the remainder there.
  const navigationDefaultSize = FULL_NAVIGATION_DEFAULT_SIZE;
  const detailDefaultSize = isPeekMode ? undefined : FULL_DETAIL_DEFAULT_SIZE;

  // The width the peek actually opens at. When expanded (a shared/reloaded
  // `?peekView=expanded` link) the panel renders at ~viewport width, NOT the
  // widget fraction — so we must size the split against that, or a first-open
  // expanded peek on a big screen re-creates the wide-tree bug. The sidebar
  // offset is ignored (the nav is width-capped at these sizes, so the small
  // difference doesn't move the split). 0 outside peek / during SSR. Mount-time
  // default only (a saved layout wins after first open), so it doesn't track
  // viewport changes.
  const [peekView] = useQueryParam("peekView", StringParam);
  const isPeekExpanded = isPeekMode && peekView === "expanded";
  const peekWidthPx = useMemo(() => {
    if (!isPeekMode || typeof window === "undefined") return 0;
    return isPeekExpanded
      ? window.innerWidth
      : resolveEffectiveWidthFraction() * window.innerWidth;
  }, [isPeekMode, isPeekExpanded]);

  // Deterministic peek default split, computed from `peekWidthPx`. Only used on
  // first open (no saved layout); memoized so the Group sees a stable prop.
  // Undefined for the full-page view and during SSR.
  const peekDefaultLayout = useMemo(() => {
    const navPercent = computePeekNavPercent(peekWidthPx);
    if (navPercent === undefined) return undefined;
    return {
      [RESIZABLE_PANEL_NAVIGATION_ID]: navPercent,
      [RESIZABLE_PANEL_PREVIEW_ID]: 100 - navPercent,
    };
  }, [peekWidthPx]);

  // Restored layout for this group. Read before the collapse flags so we can
  // seed them from what the library is about to restore on mount — otherwise the
  // first render derives `bothPanelsOpen` purely from the useState defaults
  // (open), pins the group to 621px even when a persisted layout has a panel on
  // its 40px rail, and a narrow peek flashes a useless horizontal scrollbar
  // until the Panel's onResize corrects the flag a frame later.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: groupId,
    panelIds: [RESIZABLE_PANEL_NAVIGATION_ID, RESIZABLE_PANEL_PREVIEW_ID],
    storage,
  });

  // Collapse-seed threshold: width-aware for the peek (whose width we know), so
  // a small-share-but-open nav on a wide peek isn't mis-seeded as collapsed;
  // fixed fallback for the full-page view (its width isn't known here).
  const collapseSeedMaxSharePct =
    isPeekMode && peekWidthPx > 0
      ? collapsedShareMaxForWidth(peekWidthPx)
      : COLLAPSED_LAYOUT_SHARE_MAX_PCT;

  const [isNavigationPanelCollapsed, setIsNavigationPanelCollapsed] = useState(
    () =>
      isAnnotationMode ||
      isPanelCollapsedInLayout(
        defaultLayout,
        RESIZABLE_PANEL_NAVIGATION_ID,
        collapseSeedMaxSharePct,
      ),
  );

  // Ref to programmatically control the panel
  const panelRef = usePanelRef();

  // Detail (info/preview) panel collapse state + control.
  const detailPanelRef = usePanelRef();
  const [isDetailPanelCollapsed, setIsDetailPanelCollapsed] = useState(() =>
    isPanelCollapsedInLayout(
      defaultLayout,
      RESIZABLE_PANEL_PREVIEW_ID,
      collapseSeedMaxSharePct,
    ),
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
        const groupWidthPx = document.getElementById(groupId)?.offsetWidth ?? 0;
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
    navigationDefaultSize,
    detailDefaultSize,
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
          id={groupId}
          groupRef={groupRef}
          defaultLayout={defaultLayout ?? peekDefaultLayout}
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
  const { setIsNavigationPanelCollapsed, panelRef, navigationDefaultSize } =
    useLayoutContext();

  return (
    <Panel
      id={RESIZABLE_PANEL_NAVIGATION_ID}
      panelRef={panelRef}
      collapsible={true}
      collapsedSize="40px"
      minSize={`${NAVIGATION_PANEL_MIN_PX}px`}
      defaultSize={navigationDefaultSize}
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
    detailDefaultSize,
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
      defaultSize={detailDefaultSize}
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
