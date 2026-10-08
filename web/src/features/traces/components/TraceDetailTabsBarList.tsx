import { type ReactNode } from "react";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { InternalFeatureBadge } from "@/src/features/feature-flags";

import type { DetailTab } from "../contexts/SelectionContext";

const labels: Record<DetailTab, string> = {
  preview: "Preview",
  messages: "Messages",
  attributes: "Attributes",
  scores: "Scores",
  log: "Log View",
};

/**
 * Tab bar for the trace and observation detail panels. Which tabs a panel
 * shows depends on the trace, the project role, and the enabled features, so
 * the row is anywhere between two and five tabs wide; the ones that do not fit
 * next to the trailing controls move behind an overflow menu.
 */
export function TraceDetailTabsBarList({
  tabs,
  logViewDescription,
  trailingControls,
}: {
  tabs: DetailTab[];
  logViewDescription: string;
  trailingControls: ReactNode;
}) {
  return (
    <Tabs.OverflowList
      items={tabs.map((tab) => ({
        value: tab,
        label: labels[tab],
        badge: tab === "messages" ? <InternalFeatureBadge /> : undefined,
        tooltip: tab === "log" ? logViewDescription : undefined,
      }))}
      trailing={trailingControls}
    />
  );
}
