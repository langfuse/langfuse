import Link from "next/link";
import { Check, Plus, Settings } from "@langfuse/icons";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import {
  DropdownMenuController,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import {
  samplingLabel,
  topicFilterChips,
  topicWindowLabel,
  type TopicMapSelection,
  type TopicMapsOverview,
} from "./topic-maps";

// Local to Topics until the design-system menu supports section captions and two-line items.
function MenuSection({ title, caption }: { title: string; caption: string }) {
  return (
    <DropdownMenuLabel className="text-muted-foreground flex items-center gap-2 text-xs">
      {title}
      <span className="font-normal">{caption}</span>
    </DropdownMenuLabel>
  );
}

function MapItem({
  title,
  description,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem className="flex items-center gap-2" onSelect={onSelect}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate" title={title}>
          {title}
        </span>
        <span
          className="text-muted-foreground truncate text-xs"
          title={description}
        >
          {description}
        </span>
      </span>
      {selected ? <Check size="base" color="default" /> : null}
    </DropdownMenuItem>
  );
}

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
  const isSelected = (kind: TopicMapSelection["kind"], id: string) =>
    selection.kind === kind && selection.id === id;
  const selectedName =
    selection.kind === "rule"
      ? overview.rules.find((rule) => rule.id === selection.id)?.name
      : overview.analyses.find((analysis) => analysis.id === selection.id)
          ?.label;
  return (
    <DropdownMenuController
      align="start"
      renderMenu={() => (
        <div className="max-h-[32rem] w-80 overflow-y-auto">
          <MenuSection title="Topic rules" caption="Live maps" />
          {overview.rules.map((rule) => (
            <MapItem
              key={rule.id}
              title={rule.name}
              description={[
                topicFilterChips(rule.filter).join(" · ") || "All traces",
                samplingLabel(rule.sampling),
                rule.enabled === false ? "Disabled" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              selected={isSelected("rule", rule.id)}
              onSelect={() => onSelect({ kind: "rule", id: rule.id })}
            />
          ))}
          <DropdownMenuSeparator />
          <MenuSection
            title="Analyses"
            caption="Snapshot · one-off clustering runs"
          />
          {overview.analyses.map((analysis) => (
            <MapItem
              key={analysis.id}
              title={analysis.label}
              description={`${topicWindowLabel(analysis.timeRange)} · ${analysis.traceCount.toLocaleString("en-US")} traces`}
              selected={isSelected("analysis", analysis.id)}
              onSelect={() => onSelect({ kind: "analysis", id: analysis.id })}
            />
          ))}
          <DropdownMenuItem
            className="flex items-center gap-2"
            disabled={!canWrite}
            title={canWrite ? undefined : "You need permission to edit Topics."}
            onSelect={onNewAnalysis}
          >
            <Plus size="base" />
            New analysis
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="flex items-center gap-2">
            <Link href={rulesHref}>
              <Settings size="base" />
              Manage rules →
            </Link>
          </DropdownMenuItem>
        </div>
      )}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <button
            type="button"
            aria-label={`Topic map: ${selectedName ?? ""}`}
            className="text-foreground hover:bg-accent focus-visible:ring-ring inline-flex max-w-64 min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-sm font-bold focus-visible:ring-2 focus-visible:outline-hidden"
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
        </Trigger>
      )}
    </DropdownMenuController>
  );
}
