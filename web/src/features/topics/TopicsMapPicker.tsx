import { useState, type ReactNode } from "react";
import {
  CalendarRange,
  Check,
  Plus,
  Search,
  type IconComponent,
} from "@langfuse/icons";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { FloatingController } from "@/src/components/design-system/FloatingController/FloatingController";
import { cn } from "@/src/utils/tailwind";
import { TopicFilterChip } from "./TopicFilterChip";
import { treemapSwatchColor } from "./topic-map-colors";
import {
  filterCountLabel,
  samplingLabel,
  topicDayLabel,
  topicFilterParts,
  topicWindowLabel,
  type TopicAnalysisMap,
  type TopicMapSelection,
  type TopicMapsOverview,
  type TopicRuleMap,
} from "./topic-maps";

const TOP_TOPICS = 3;

/** Switches between maps and snapshots, previewing the hovered one. */
export function TopicsMapPicker({
  projectId,
  overview,
  selection,
  facetId,
  onSelect,
  usePreviewTopics,
  processingOn,
  create,
}: {
  projectId: string;
  overview: TopicMapsOverview;
  selection: TopicMapSelection;
  /** The question whose top topics the preview lists. */
  facetId: string | undefined;
  onSelect: (selection: TopicMapSelection) => void;
  usePreviewTopics: UsePreviewTopics;
  /** Automatic analysis is on for the project; live runs show Paused otherwise. */
  processingOn: boolean;
  /** Footer entries for New map and New snapshot; null hides one. */
  create?: { map: CreateEntry | null; snapshot: CreateEntry | null };
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [previewed, setPreviewed] = useState<TopicMapSelection | null>(null);
  const selectedRule =
    selection.kind === "rule"
      ? overview.rules.find((rule) => rule.id === selection.id)
      : undefined;
  const selectedAnalysis =
    selection.kind === "analysis"
      ? overview.analyses.find((analysis) => analysis.id === selection.id)
      : undefined;
  const selectedName = selectedRule?.name ?? selectedAnalysis?.label ?? "";
  const query = search.trim().toLowerCase();
  // Paused maps sort below active ones; order is otherwise kept.
  const rules = overview.rules
    .filter((rule) => rule.name.toLowerCase().includes(query))
    .sort((a, b) => Number(a.enabled === false) - Number(b.enabled === false));
  const analyses = overview.analyses.filter((analysis) =>
    analysis.label.toLowerCase().includes(query),
  );
  const shown = previewed ?? selection;
  const shownRule =
    shown.kind === "rule"
      ? overview.rules.find((rule) => rule.id === shown.id)
      : undefined;
  const shownAnalysis =
    shown.kind === "analysis"
      ? overview.analyses.find((analysis) => analysis.id === shown.id)
      : undefined;
  const isSelected = (kind: TopicMapSelection["kind"], id: string) =>
    selection.kind === kind && selection.id === id;
  function choose(next: TopicMapSelection) {
    onSelect(next);
    changeOpen(false);
  }
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setSearch("");
      setPreviewed(null);
    }
  }
  return (
    <FloatingController
      open={open}
      onOpenChange={changeOpen}
      interaction="click"
      placement="bottom-start"
      isScrollable
      renderContent={(floatingProps) => (
        <div
          {...floatingProps}
          aria-label="Topic maps"
          className="ph-no-capture bg-popover text-popover-foreground z-50 flex w-200 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border shadow-md"
        >
          <div className="flex w-full min-w-0 flex-col sm:w-2/5 sm:border-r">
            <label className="flex items-center gap-2 border-b px-4">
              <Search size="base" color="tertiary" aria-hidden />
              <input
                type="search"
                aria-label="Search maps"
                placeholder="Search"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                className="placeholder:text-muted-foreground h-9.5 w-full min-w-0 border-0 bg-transparent text-sm outline-hidden focus:ring-0 [&::-webkit-search-cancel-button]:hidden"
              />
            </label>
            <div className="flex min-h-0 flex-col overflow-y-auto p-1.5">
              <Section>
                {rules.map((rule) => (
                  <MapRow
                    key={rule.id}
                    name={rule.name}
                    meta={[
                      filterCountLabel(rule.filter),
                      samplingLabel(rule.sampling),
                      rule.enabled === false ? "Paused" : null,
                    ]}
                    selected={isSelected("rule", rule.id)}
                    onPreview={() =>
                      setPreviewed({ kind: "rule", id: rule.id })
                    }
                    onSelect={() => choose({ kind: "rule", id: rule.id })}
                  />
                ))}
              </Section>
              {analyses.length > 0 && (
                <Section label="Snapshots" divider>
                  {analyses.map((analysis) => (
                    <MapRow
                      key={analysis.id}
                      name={analysis.label}
                      meta={[
                        topicWindowLabel(analysis.timeRange),
                        `${analysis.traceCount.toLocaleString("en-US")} traces`,
                      ]}
                      selected={isSelected("analysis", analysis.id)}
                      onPreview={() =>
                        setPreviewed({ kind: "analysis", id: analysis.id })
                      }
                      onSelect={() =>
                        choose({ kind: "analysis", id: analysis.id })
                      }
                    />
                  ))}
                </Section>
              )}
              {rules.length === 0 && analyses.length === 0 && (
                <p className="text-muted-foreground px-2.5 py-2 text-sm">
                  No maps match “{search}”.
                </p>
              )}
            </div>
            {create && (create.map || create.snapshot) && (
              <div className="mt-auto flex flex-col border-t p-1.5">
                {create.map && (
                  <CreateButton
                    entry={create.map}
                    icon={Plus}
                    label="New map"
                    onChosen={() => changeOpen(false)}
                  />
                )}
                {create.snapshot && (
                  <CreateButton
                    entry={create.snapshot}
                    icon={CalendarRange}
                    label="New snapshot"
                    onChosen={() => changeOpen(false)}
                  />
                )}
              </div>
            )}
          </div>
          {/* Too narrow on phones, where a tap selects before the preview could help. */}
          <div className="hidden w-3/5 min-w-0 flex-col overflow-y-auto p-4 sm:flex">
            {shownRule && (
              <RulePreview
                key={shownRule.id}
                projectId={projectId}
                usePreviewTopics={usePreviewTopics}
                rule={shownRule}
                facetId={facetId}
                processingOn={processingOn}
              />
            )}
            {shownAnalysis && (
              <AnalysisPreview
                key={shownAnalysis.id}
                projectId={projectId}
                usePreviewTopics={usePreviewTopics}
                analysis={shownAnalysis}
                facetId={facetId}
              />
            )}
          </div>
        </div>
      )}
    >
      {({ getTriggerProps }) => (
        <button
          {...getTriggerProps()}
          type="button"
          aria-label={`Topic map: ${selectedName}`}
          className={cn(
            "ph-no-capture text-foreground hover:bg-accent focus-visible:ring-ring inline-flex h-7 max-w-72 min-w-0 items-center gap-1.5 rounded-md border pr-2 text-xs font-bold focus-visible:ring-2 focus-visible:outline-hidden",
            // A leading badge sits closer to the border than plain text.
            selectedRule || selectedAnalysis ? "pl-1" : "pl-2",
          )}
        >
          {selectedRule && (
            <LiveBadge
              paused={!processingOn || selectedRule.enabled === false}
            />
          )}
          {selectedAnalysis && <SnapshotBadge />}
          <span className="truncate" title={selectedName}>
            {selectedName}
          </span>
          <DropdownIndicator />
        </button>
      )}
    </FloatingController>
  );
}

type CreateEntry = { onSelect: () => void; disabledReason?: string };

function CreateButton({
  entry,
  icon: Icon,
  label,
  onChosen,
}: {
  entry: CreateEntry;
  icon: IconComponent;
  label: string;
  onChosen: () => void;
}) {
  const button = (
    <button
      type="button"
      disabled={Boolean(entry.disabledReason)}
      onClick={() => {
        onChosen();
        entry.onSelect();
      }}
      className="hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon size="base" color="default" aria-hidden />
      {label}
    </button>
  );
  if (!entry.disabledReason) return button;
  return (
    // Disabled buttons fire no pointer events, so the tooltip listens on a wrapper.
    <Tooltip label={entry.disabledReason}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          className="flex w-full cursor-not-allowed [&>button]:pointer-events-none"
        >
          {button}
        </span>
      )}
    </Tooltip>
  );
}

/** A snapshot's badge: a fixed map that never updates. */
function SnapshotBadge() {
  return <Badge text="SNAPSHOT" size="sm" color="info" />;
}

/** A map's state: LIVE, or PAUSED when stopped. */
function LiveBadge({ paused }: { paused: boolean }) {
  return paused ? (
    <Badge text="PAUSED" size="sm" color="filled" />
  ) : (
    <Badge text="LIVE" size="sm" color="success" />
  );
}

function Section({
  label,
  caption,
  divider = false,
  children,
}: {
  label?: string;
  caption?: string;
  divider?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col",
        divider && "-mx-1.5 mt-1.5 border-t px-1.5 pt-1.5",
      )}
    >
      {label && (
        <div className="flex items-baseline justify-between gap-2 px-2.5 pt-1.5 pb-1">
          <span className="text-muted-foreground text-xs font-bold">
            {label}
          </span>
          {caption && (
            <span className="text-muted-foreground text-xs">{caption}</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function MapRow({
  name,
  meta,
  selected,
  onPreview,
  onSelect,
}: {
  name: string;
  meta: (string | null)[];
  selected: boolean;
  onPreview: () => void;
  onSelect: () => void;
}) {
  const metaText = meta.filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      aria-pressed={selected}
      onMouseEnter={onPreview}
      onFocus={onPreview}
      onClick={onSelect}
      className="hover:bg-accent focus-visible:bg-accent flex items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left focus-visible:outline-hidden"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm" title={name}>
            {name}
          </span>
        </span>
        <span
          className="text-muted-foreground truncate text-xs"
          title={metaText}
        >
          {metaText}
        </span>
      </span>
      {selected && <Check size="base" color="default" aria-hidden />}
    </button>
  );
}

function PreviewHeader({ name, badge }: { name: string; badge?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate text-base font-bold" title={name}>
        {name}
      </span>
      {badge}
    </div>
  );
}

function PreviewRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[6rem_1fr] items-start gap-x-4 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          {/* Rows match the filter chip's height so plain values line up with it. */}
          <dt className="text-muted-foreground flex min-h-5.75 items-center">
            {label}
          </dt>
          <dd className="flex min-h-5.75 min-w-0 items-center">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FilterValue({ filter }: { filter: TopicRuleMap["filter"] }) {
  const parts = topicFilterParts(filter);
  if (parts.length === 0) return <span>All traces</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {parts.map((part, index) => (
        <TopicFilterChip key={index} {...part} />
      ))}
    </span>
  );
}

function RulePreview({
  projectId,
  rule,
  facetId,
  usePreviewTopics,
  processingOn,
}: {
  projectId: string;
  usePreviewTopics: UsePreviewTopics;
  rule: TopicRuleMap;
  facetId: string | undefined;
  processingOn: boolean;
}) {
  const results = usePreviewTopics(projectId, { kind: "rule", id: rule.id });
  const top = topTopicsOf(results, facetId);
  return (
    <div className="flex flex-col gap-4">
      <PreviewHeader
        name={rule.name}
        badge={<LiveBadge paused={!processingOn || rule.enabled === false} />}
      />
      <PreviewRows
        rows={[
          ["Filter", <FilterValue key="filter" filter={rule.filter} />],
          ["Sample", samplingLabel(rule.sampling)],
          ...(rule.createdAt
            ? [["Since", topicDayLabel(rule.createdAt)] as [string, ReactNode]]
            : []),
        ]}
      />
      {top && <TopTopics {...top} />}
    </div>
  );
}

function AnalysisPreview({
  projectId,
  analysis,
  facetId,
  usePreviewTopics,
}: {
  projectId: string;
  usePreviewTopics: UsePreviewTopics;
  analysis: TopicAnalysisMap;
  facetId: string | undefined;
}) {
  const results = usePreviewTopics(projectId, {
    kind: "analysis",
    id: analysis.id,
  });
  const top = topTopicsOf(results, facetId);
  return (
    <div className="flex flex-col gap-4">
      <PreviewHeader name={analysis.label} badge={<SnapshotBadge />} />
      <PreviewRows
        rows={[
          ["Filter", <FilterValue key="filter" filter={analysis.filter} />],
          ["Window", topicWindowLabel(analysis.timeRange)],
          ["Traces", analysis.traceCount.toLocaleString("en-US")],
        ]}
      />
      {top && <TopTopics {...top} />}
    </div>
  );
}

type PreviewFacet = {
  facetId: string;
  name: string;
  topics: { id: string; name: string; count: number }[];
};

/** Topics of one map for the preview pane; null skips the request. */
export type UsePreviewTopics = (
  projectId: string,
  map: TopicMapSelection | null,
) => { facets: PreviewFacet[] | undefined; loading: boolean };

/** The question's largest topics, or null while loading or when there are none. */
function topTopicsOf(
  results: ReturnType<UsePreviewTopics>,
  facetId: string | undefined,
) {
  if (results.loading) return null;
  const facet =
    results.facets?.find((item) => item.facetId === facetId) ??
    results.facets?.[0];
  if (!facet) return null;
  const topics = [...facet.topics]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_TOPICS);
  return topics.length ? { facetName: facet.name, topics } : null;
}

/** The question's largest topics, colored like the treemap's first tiles. */
function TopTopics({
  facetName,
  topics,
}: {
  facetName: string;
  topics: PreviewFacet["topics"];
}) {
  const maxCount = Math.max(1, ...topics.map((topic) => topic.count));
  return (
    <div className="flex flex-col gap-3 pt-2">
      <span className="text-muted-foreground text-xs font-bold">
        {`Top ${pluralLabel(facetName)}`}
      </span>
      {topics.map((topic, rank) => (
        <div key={topic.id} className="flex flex-col gap-1.5">
          <span className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="truncate text-sm" title={topic.name}>
              {topic.name}
            </span>
            <span className="text-muted-foreground shrink-0 font-mono text-xs">
              {topic.count.toLocaleString("en-US")}
            </span>
          </span>
          <span aria-hidden className="bg-muted h-1.5 w-full rounded-full">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${(topic.count / maxCount) * 100}%`,
                backgroundColor: treemapSwatchColor(rank),
              }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

/** A question name as a plural label, e.g. "Intent" as "intents". */
function pluralLabel(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith("s") ? lower : `${lower}s`;
}
