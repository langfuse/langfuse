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
 * Selection → Info wiring is purely imperative: all three navigators
 * (Tree/Timeline/Graph) call `switchToInfoTab()` on select, so selecting a node
 * jumps to Info. There is deliberately NO reactive selection→tab effect — see
 * `switchToInfoTab` for why one would corrupt Back/Forward.
 */

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
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

  // Auto-switch to Info writes PUSH, not replace. Every navigator's select
  // handler writes the `?observation=` param (pushIn) and calls this in the
  // SAME tick, so with use-query-params batching (`enableBatching`, set in
  // _app.tsx) both writes fold into ONE navigation whose updateType is taken
  // from the LAST enqueued write — pushIn here keeps the combined selection+tab
  // change as a single pushed history entry, so Back returns to the
  // pre-selection view. (replaceIn would downgrade the whole batch to
  // history.replaceState and drop that entry, so Back would leave the trace.)
  //
  // There is deliberately NO reactive selection→tab effect. All three
  // navigators call this imperatively, so an effect keyed on `selectedNodeId`
  // would be redundant on forward selections — and would BREAK Back/Forward: a
  // POP that restores an older `{observation, mobileTab=tree}` entry changes
  // `selectedNodeId`, which an effect cannot distinguish from a live tap, so it
  // would immediately overwrite the just-restored tab back to Info and trap the
  // user (LFE-11067). Letting the restored URL win outright is correct.
  const switchToInfoTab = useCallback(() => {
    setTabParam("info", "pushIn");
  }, [setTabParam]);

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
