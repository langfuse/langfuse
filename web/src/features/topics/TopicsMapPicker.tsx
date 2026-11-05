import { Check, Plus, Settings } from "@langfuse/icons";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import {
  samplingLabel,
  topicFilterChips,
  topicWindowLabel,
  type TopicMapSelection,
  type TopicMapsOverview,
} from "./topic-maps";

/** Switches between the live maps of rules and the snapshots of analyses. */
export function TopicsMapPicker({
  overview,
  selection,
  onSelect,
  onNewAnalysis,
  rulesHref,
  canWrite,
}: {
  overview: TopicMapsOverview;
  selection: TopicMapSelection;
  onSelect: (selection: TopicMapSelection) => void;
  onNewAnalysis: () => void;
  rulesHref: string;
  canWrite: boolean;
}) {
  const selectedName =
    selection.kind === "rule"
      ? overview.rules.find((rule) => rule.id === selection.id)?.name
      : overview.analyses.find((analysis) => analysis.id === selection.id)
          ?.label;
  const checked = (kind: TopicMapSelection["kind"], id: string) =>
    selection.kind === kind && selection.id === id ? (
      <Check size="base" color="default" />
    ) : undefined;
  const caption = (text: string) => (
    <span className="text-muted-foreground text-xs font-normal">{text}</span>
  );
  const items: DropdownMenuItemDefinition[] = [
    {
      id: "rules-label",
      type: "label",
      title: "Topic rules",
      badge: caption("Live maps"),
    },
    ...overview.rules.map((rule) => ({
      id: `rule:${rule.id}`,
      type: "item" as const,
      title: rule.name,
      description: [
        topicFilterChips(rule.filter).join(" · ") || "All traces",
        samplingLabel(rule.sampling),
        rule.enabled === false ? "Disabled" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      badge: checked("rule", rule.id),
      onClick: () => onSelect({ kind: "rule", id: rule.id }),
    })),
    { id: "analyses-separator", type: "separator" },
    {
      id: "analyses-label",
      type: "label",
      title: "Analyses",
      badge: caption("Snapshot · one-off clustering runs"),
    },
    ...overview.analyses.map((analysis) => ({
      id: `analysis:${analysis.id}`,
      type: "item" as const,
      title: analysis.label,
      description: `${topicWindowLabel(analysis.timeRange)} · ${analysis.traceCount.toLocaleString("en-US")} traces`,
      badge: checked("analysis", analysis.id),
      onClick: () => onSelect({ kind: "analysis", id: analysis.id }),
    })),
    {
      id: "new-analysis",
      type: "item",
      title: "New analysis",
      icon: Plus,
      disabled: canWrite
        ? undefined
        : { reason: "You need permission to edit Topics." },
      onClick: onNewAnalysis,
    },
    { id: "rules-separator", type: "separator" },
    {
      id: "manage-rules",
      type: "item",
      title: "Manage rules →",
      icon: Settings,
      href: rulesHref,
    },
  ];
  return (
    <DropdownMenu
      ariaLabel="Topic maps"
      items={items}
      maxHeight="32rem"
      noCapture
    >
      {({ getTriggerProps }) => (
        <button
          {...getTriggerProps()}
          type="button"
          aria-label={`Topic map: ${selectedName ?? ""}`}
          className="ph-no-capture text-foreground hover:bg-accent focus-visible:ring-ring inline-flex max-w-64 min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-sm font-bold focus-visible:ring-2 focus-visible:outline-hidden"
        >
          <Badge
            text={selection.kind === "rule" ? "Live" : "Snapshot"}
            size="sm"
            color={selection.kind === "rule" ? "green" : "blue"}
          />
          <span className="truncate" title={selectedName}>
            {selectedName}
          </span>
          <DropdownIndicator />
        </button>
      )}
    </DropdownMenu>
  );
}
