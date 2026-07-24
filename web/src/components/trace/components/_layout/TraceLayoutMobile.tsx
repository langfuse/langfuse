/**
 * TraceLayoutMobile - Tabbed, full-height trace view for mobile devices.
 *
 * Replaces the old accordion (a ~384px-capped navigation stacked over a cramped
 * detail, with no way to switch tree/timeline and the graph jammed into a 256px
 * slot). Instead: a top tab bar — Tree · Timeline · Graph · Info — where each
 * body fills the viewport. Tree/Timeline/Graph are full-height navigators;
 * selecting an observation in any of them jumps to the Info tab (which reuses
 * the shared detail panel). See MobileTraceContent in Trace.tsx for composition.
 *
 * Mobile-only: this component (and its context) render solely under the mobile
 * path. Desktop uses TraceLayoutDesktop and never mounts this.
 *
 * Tab state lives in the `?mobileTab` URL param (shareable + back-able), never
 * mirrored into local state. The default is computed once at mount: a deep link
 * / row click that already targeted an observation opens on Info, otherwise on
 * Tree.
 *
 * Selection → Info wiring is two-pronged:
 *  - An effect mirrors the external `?observation=` param (written by all three
 *    navigators, including the graph which bypasses our imperative path) onto
 *    the tab whenever the selection CHANGES.
 *  - `switchToInfoTab()` on the context covers same-node re-taps, where the URL
 *    param — and thus the effect — wouldn't fire. Tree/Timeline call it in their
 *    select handlers; the graph wrapper routes its onObservationSelect to it.
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StringParam, useQueryParam } from "use-query-params";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { useSelection } from "../../contexts/SelectionContext";

export type MobileTraceTab = "tree" | "timeline" | "graph" | "info";
const VALID_TABS: MobileTraceTab[] = ["tree", "timeline", "graph", "info"];

function isValidTab(value: string | null | undefined): value is MobileTraceTab {
  return VALID_TABS.includes(value as MobileTraceTab);
}

// Mirror of TraceLayoutDesktop's layout context: exposes the imperative
// tab-switch so shared navigators can wire mobile behavior additively.
interface MobileLayoutContextValue {
  switchToInfoTab: () => void;
}

const MobileLayoutContext = createContext<MobileLayoutContextValue | null>(
  null,
);

/**
 * Safe variant for components rendered in BOTH desktop and mobile layouts
 * (desktop has no provider): returns null instead of throwing, so a `?.` call
 * is a no-op on desktop and keeps the desktop path byte-identical.
 */
export function useMobileLayoutContextOptional() {
  return useContext(MobileLayoutContext);
}

const TAB_BODY_CLASS = "mt-0 flex min-h-0 flex-1 flex-col overflow-hidden";

export function TraceLayoutMobile({
  tree,
  timeline,
  graph,
  info,
  showGraph,
}: {
  tree: ReactNode;
  timeline: ReactNode;
  graph: ReactNode;
  info: ReactNode;
  /** Reused from TraceContent; hides the Graph tab when the trace has no graph. */
  showGraph: boolean;
}) {
  const [tabParam, setTabParam] = useQueryParam("mobileTab", StringParam);
  const { selectedNodeId } = useSelection();

  // Mount-time default only (captured once, never re-derived): a selection that
  // was already present when the view opened lands on Info; otherwise Tree.
  const [initialTab] = useState<MobileTraceTab>(() =>
    selectedNodeId ? "info" : "tree",
  );

  const requestedTab = isValidTab(tabParam) ? tabParam : initialTab;
  // The Graph tab is conditionally rendered; if a stale/shared URL asks for it
  // while it's unavailable, fall back to Tree.
  const activeTab: MobileTraceTab =
    requestedTab === "graph" && !showGraph ? "tree" : requestedTab;

  // Auto-switch writes REPLACE (they piggyback on the selection the navigator
  // just pushed — one user action stays one history entry); explicit tab taps
  // push (so Back returns to the previous tab).
  const switchToInfoTab = useCallback(() => {
    setTabParam("info", "replaceIn");
  }, [setTabParam]);

  // The single sanctioned selection→tab effect: synchronize the tab to an
  // EXTERNAL change of the `?observation=` param. All three navigators land on
  // that param, so this covers cross-navigator selection and — crucially — the
  // graph, which writes `?observation=` directly rather than through our
  // imperative switchToInfoTab. Guarded to genuine changes (ref seeded to the
  // mount value) so a plain deep link is handled by `initialTab`, not a write.
  const prevSelectedRef = useRef<string | null>(selectedNodeId ?? null);
  useEffect(() => {
    if (selectedNodeId && selectedNodeId !== prevSelectedRef.current) {
      setTabParam("info", "replaceIn");
    }
    prevSelectedRef.current = selectedNodeId ?? null;
  }, [selectedNodeId, setTabParam]);

  const contextValue = useMemo<MobileLayoutContextValue>(
    () => ({ switchToInfoTab }),
    [switchToInfoTab],
  );

  return (
    <MobileLayoutContext.Provider value={contextValue}>
      <TabsBar
        value={activeTab}
        onValueChange={(value) => setTabParam(value, "pushIn")}
        className="h-full w-full"
      >
        <TabsBarList className="shrink-0 px-2">
          <TabsBarTrigger value="tree">Tree</TabsBarTrigger>
          <TabsBarTrigger value="timeline">Timeline</TabsBarTrigger>
          {showGraph && <TabsBarTrigger value="graph">Graph</TabsBarTrigger>}
          <TabsBarTrigger value="info">Info</TabsBarTrigger>
        </TabsBarList>

        {/* Inactive tabs unmount (Radix default). On memory-constrained mobile
            that keeps a single heavy subtree live at a time (two virtualizers,
            the elk graph layout, and the detail JSON never all mount at once);
            the cost is that a navigator's scroll/zoom resets when revisited —
            an accepted v1 tradeoff (follow-up: preserve navigator state). */}
        <TabsBarContent value="tree" className={TAB_BODY_CLASS}>
          {tree}
        </TabsBarContent>
        <TabsBarContent value="timeline" className={TAB_BODY_CLASS}>
          {timeline}
        </TabsBarContent>
        {showGraph && (
          <TabsBarContent value="graph" className={TAB_BODY_CLASS}>
            {graph}
          </TabsBarContent>
        )}
        <TabsBarContent value="info" className={TAB_BODY_CLASS}>
          {info}
        </TabsBarContent>
      </TabsBar>
    </MobileLayoutContext.Provider>
  );
}
