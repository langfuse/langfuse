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
 * Mobile-only: this component renders solely under the mobile
 * path. Desktop uses TraceLayoutDesktop and never mounts this.
 *
 * Tab state lives in the `?mobileTab` URL param (shareable + back-able), never
 * mirrored into local state. The default is computed once at mount: a deep link
 * / row click that already targeted an observation opens on Info, otherwise on
 * Tree.
 *
 * Selection → Info wiring is purely imperative: all three navigators
 * (Tree/Timeline/Graph) use the parent's select-and-open action. There is no
 * reactive selection→tab effect that could overwrite restored browser history.
 */

import { type ReactNode } from "react";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { useSelection } from "../contexts/SelectionContext";
import { TraceTruncationNotice } from "./TraceTruncationNotice";

export type MobileTraceTab = "tree" | "timeline" | "graph" | "info";
export function TraceLayoutMobile({
  tree,
  timeline,
  graph,
  info,
  showGraph,
  isLoading = false,
}: {
  tree: ReactNode;
  timeline: ReactNode;
  graph: ReactNode;
  info: ReactNode;
  /** Reused from TraceContent; hides the Graph tab when the trace has no graph. */
  showGraph: boolean;
  /** Skips the data-bound notice while the panels show placeholders. */
  isLoading?: boolean;
}) {
  const { mobileTab, setMobileTab } = useSelection();
  // The Graph tab is conditionally rendered; if a stale/shared URL asks for it
  // while it's unavailable, fall back to Tree.
  const activeTab: MobileTraceTab =
    mobileTab === "graph" && !showGraph ? "tree" : mobileTab;
  const handleTabChange = (value: string) => {
    if (
      value === "tree" ||
      value === "timeline" ||
      value === "graph" ||
      value === "info"
    ) {
      setMobileTab(value);
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} layout="fill">
      <Tabs.List variant="underline">
        <Tabs.Trigger value="tree" label="Tree" />
        <Tabs.Trigger value="timeline" label="Timeline" />
        {showGraph && <Tabs.Trigger value="graph" label="Graph" />}
        <Tabs.Trigger value="info" label="Data" />
      </Tabs.List>

      {/* Above the tab bodies, not inside one: the truncation applies to every
            tab, and the navigators own their own scroll containers. */}
      {!isLoading && <TraceTruncationNotice />}

      {/* Inactive tabs unmount (Radix default). On memory-constrained mobile
            that keeps a single heavy subtree live at a time (two virtualizers,
            the elk graph layout, and the detail JSON never all mount at once);
            the cost is that a navigator's scroll/zoom resets when revisited —
            an accepted v1 tradeoff (follow-up: preserve navigator state). */}
      <Tabs.Content value="tree" layout="fill">
        {tree}
      </Tabs.Content>
      <Tabs.Content value="timeline" layout="fill">
        {timeline}
      </Tabs.Content>
      {showGraph && (
        <Tabs.Content value="graph" layout="fill">
          {graph}
        </Tabs.Content>
      )}
      <Tabs.Content value="info" layout="fill">
        {info}
      </Tabs.Content>
    </Tabs>
  );
}
