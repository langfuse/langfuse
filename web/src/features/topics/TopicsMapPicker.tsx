import { useState, type ReactNode } from "react";
import {
  CalendarRange,
  Camera,
  Check,
  Layers,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  type IconComponent,
} from "@langfuse/icons";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { FloatingController } from "@/src/components/design-system/FloatingController/FloatingController";
import { cn } from "@/src/utils/tailwind";
import { TopicFilterChip } from "./TopicFilterChip";
import { treemapSwatchColor } from "./topic-map-colors";
import { TOPIC_SETUP_BACKFILL_LIMIT } from "./topic-setup-flow";
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
const REFRESH_DESCRIPTION =
  "Recluster this map's topics now instead of waiting for the nightly update.";

type CreateKind = "map" | "snapshot";
/** What the preview pane shows: a map, or what a footer entry would create. */
type Previewed = TopicMapSelection | { kind: "create"; entry: CreateKind };

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
  refresh,
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
  create?: { map: FooterEntry | null; snapshot: FooterEntry | null };
  /** Reclusters a live map now, offered on its preview card. */
  refresh?: ((rule: TopicRuleMap) => FooterEntry) | null;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [previewed, setPreviewed] = useState<Previewed | null>(null);
  const selectedRule =
    selection.kind === "rule"
      ? overview.rules.find((rule) => rule.id === selection.id)
      : undefined;
  const selectedAnalysis =
    selection.kind === "analysis"
      ? overview.analyses.find((analysis) => analysis.id === selection.id)
      : undefined;
  const selectedName = selectedRule?.name ?? selectedAnalysis?.label ?? "";
  const refreshEntry = selectedRule && refresh ? refresh(selectedRule) : null;
  const hasCreate = Boolean(create && (create.map || create.snapshot));
  const query = search.trim().toLowerCase();
  // Paused maps sort below active ones; order is otherwise kept.
  const rules = overview.rules
    .filter((rule) => rule.name.toLowerCase().includes(query))
    .sort((a, b) => Number(a.enabled === false) - Number(b.enabled === false));
  const analyses = overview.analyses.filter((analysis) =>
    analysis.label.toLowerCase().includes(query),
  );
  const shown: Previewed = previewed ?? selection;
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
              <Section label={rules.length > 0 ? "Live maps" : undefined}>
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
            {(refreshEntry || hasCreate) && (
              <div
                className={cn(
                  "mt-auto flex flex-col border-t p-1.5",
                  !hasCreate && "sm:hidden",
                )}
              >
                {/* Phones have no preview card, so the selected map's refresh sits here. */}
                {refreshEntry && (
                  <div className="flex flex-col sm:hidden">
                    <FooterButton
                      entry={refreshEntry}
                      icon={RefreshCw}
                      label={`Refresh “${selectedName}”`}
                      description={REFRESH_DESCRIPTION}
                      onChosen={() => changeOpen(false)}
                    />
                    {hasCreate && <div className="-mx-1.5 my-1.5 border-t" />}
                  </div>
                )}
                {create?.map && (
                  <FooterButton
                    entry={create.map}
                    icon={Plus}
                    label="New live map"
                    onPreview={() =>
                      setPreviewed({ kind: "create", entry: "map" })
                    }
                    onChosen={() => changeOpen(false)}
                  />
                )}
                {create?.snapshot && (
                  <FooterButton
                    entry={create.snapshot}
                    icon={CalendarRange}
                    label="New snapshot"
                    onPreview={() =>
                      setPreviewed({ kind: "create", entry: "snapshot" })
                    }
                    onChosen={() => changeOpen(false)}
                  />
                )}
              </div>
            )}
          </div>
          {/* Too narrow on phones, where a tap selects before the preview could help. */}
          <div className="hidden w-3/5 min-w-0 overflow-y-auto sm:block">
            {/* At least as tall as a map preview with three top topics, so hovering between entries keeps the popover's height. Set inside the pane so short viewports still scroll it. */}
            <div className="min-h-81.75 p-4">
              {shownRule && (
                <RulePreview
                  key={shownRule.id}
                  projectId={projectId}
                  usePreviewTopics={usePreviewTopics}
                  rule={shownRule}
                  facetId={facetId}
                  processingOn={processingOn}
                  refresh={refresh ? refresh(shownRule) : null}
                  onRefreshChosen={() => changeOpen(false)}
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
              {shown.kind === "create" && (
                <CreatePreview
                  entry={shown.entry}
                  disabledReason={create?.[shown.entry]?.disabledReason}
                  processingOn={processingOn}
                />
              )}
            </div>
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
            "ph-no-capture text-foreground hover:bg-accent focus-visible:ring-ring inline-flex h-8 max-w-72 min-w-0 items-center gap-1.5 rounded-md border pr-2 text-xs font-bold focus-visible:ring-2 focus-visible:outline-hidden md:h-7",
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

type FooterEntry = { onSelect: () => void; disabledReason?: string };

function FooterButton({
  entry,
  icon: Icon,
  label,
  description,
  onPreview,
  onChosen,
}: {
  entry: FooterEntry;
  icon: IconComponent;
  label: string;
  /** A second line saying what the entry does; a disabled entry shows its reason there. */
  description?: string;
  /** Shows what the entry would do in the preview pane. */
  onPreview?: () => void;
  onChosen: () => void;
}) {
  // Touch screens show no tooltip, so a disabled entry's reason is on screen.
  const secondLine = entry.disabledReason ?? description;
  const button = (
    <button
      type="button"
      disabled={Boolean(entry.disabledReason)}
      onMouseEnter={onPreview}
      onFocus={onPreview}
      onClick={() => {
        onChosen();
        entry.onSelect();
      }}
      className="hover:bg-accent focus-visible:bg-accent flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
    >
      {/* Centered on the label's first line, not on a two-line entry. */}
      <span className="flex h-5 shrink-0 items-center">
        <Icon size="base" color="default" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate" title={label}>
          {label}
        </span>
        {secondLine && (
          <span className="text-muted-foreground text-xs">{secondLine}</span>
        )}
      </span>
    </button>
  );
  if (!entry.disabledReason || !onPreview) return button;
  return (
    // Disabled buttons fire no pointer events, so the wrapper starts the preview.
    <span
      onMouseEnter={onPreview}
      className="flex w-full cursor-not-allowed [&>button]:pointer-events-none"
    >
      {button}
    </span>
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

function PreviewHeader({
  name,
  badge,
  action,
}: {
  name: string;
  badge?: ReactNode;
  /** Sits at the card's top right. */
  action?: ReactNode;
}) {
  return (
    // As tall as the small action button, so every preview's title sits at the same spot.
    <div className="flex h-7 min-w-0 items-center gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-base font-bold" title={name}>
          {name}
        </span>
        {badge}
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}

/** Refreshes the previewed live map; a disabled one says why below the header. */
function RefreshMapButton({
  entry,
  onChosen,
}: {
  entry: FooterEntry;
  onChosen: () => void;
}) {
  if (entry.disabledReason)
    return (
      <Button
        text="Refresh"
        icon={RefreshCw}
        size="sm"
        variant="outline"
        disabled
      />
    );
  return (
    <Tooltip label={REFRESH_DESCRIPTION}>
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()} className="inline-flex">
          <Button
            text="Refresh"
            icon={RefreshCw}
            size="sm"
            variant="outline"
            onClick={() => {
              onChosen();
              entry.onSelect();
            }}
          />
        </span>
      )}
    </Tooltip>
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
  refresh,
  onRefreshChosen,
}: {
  projectId: string;
  usePreviewTopics: UsePreviewTopics;
  rule: TopicRuleMap;
  facetId: string | undefined;
  processingOn: boolean;
  refresh: FooterEntry | null;
  onRefreshChosen: () => void;
}) {
  const results = usePreviewTopics(projectId, { kind: "rule", id: rule.id });
  const top = topTopicsOf(results, facetId);
  return (
    <div className="flex flex-col gap-4">
      <PreviewHeader
        name={rule.name}
        badge={<LiveBadge paused={!processingOn || rule.enabled === false} />}
        action={
          refresh && (
            <RefreshMapButton entry={refresh} onChosen={onRefreshChosen} />
          )
        }
      />
      {/* Touch screens show no tooltip, so the reason is on screen. */}
      {refresh?.disabledReason && (
        <p className="text-muted-foreground text-right text-xs">
          {refresh.disabledReason}
        </p>
      )}
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

const CREATE_EXPLANATIONS: Record<
  CreateKind,
  {
    title: string;
    summary: string;
    points: { icon: IconComponent; text: string }[];
    bestFor: string;
  }
> = {
  map: {
    title: "New live map",
    summary:
      "Groups the traces that match a filter into topics, and keeps sorting new traces into them as they arrive.",
    points: [
      {
        icon: Layers,
        text: `Builds the first map from existing summaries, plus up to ${TOPIC_SETUP_BACKFILL_LIMIT.toLocaleString("en-US")} newly summarized recent traces.`,
      },
      {
        icon: Radio,
        text: "Analyzes new matching traces as they arrive, at the sampling rate you choose.",
      },
      {
        icon: RefreshCw,
        text: "Refits nightly, so new topics show up over time.",
      },
    ],
    bestFor: "Watching production traffic over time.",
  },
  snapshot: {
    title: "New snapshot",
    summary:
      "Groups the traces that match a filter in a past time window into topics, once.",
    points: [
      {
        icon: CalendarRange,
        text: "Covers the time window you pick.",
      },
      {
        icon: Sparkles,
        text: "Can summarize more traces first for a fuller picture.",
      },
      {
        icon: Camera,
        text: "Runs once. A snapshot doesn’t change afterwards.",
      },
    ],
    bestFor: "One-off investigations, such as after a release or an incident.",
  },
};

/** What a footer entry creates, shown while it is hovered or focused. */
function CreatePreview({
  entry,
  disabledReason,
  processingOn,
}: {
  entry: CreateKind;
  disabledReason?: string;
  processingOn: boolean;
}) {
  const explanation = CREATE_EXPLANATIONS[entry];
  const notice =
    disabledReason ??
    (entry === "map" && !processingOn
      ? "Automatic analysis is off, so a new map stays paused until it’s turned on."
      : undefined);
  return (
    <div className="flex flex-col gap-4">
      <PreviewHeader
        name={explanation.title}
        badge={
          entry === "map" ? (
            <LiveBadge paused={!processingOn} />
          ) : (
            <SnapshotBadge />
          )
        }
      />
      <p className="text-muted-foreground text-sm">{explanation.summary}</p>
      <ul className="flex flex-col gap-2 text-sm">
        {explanation.points.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2">
            <span className="flex h-5 shrink-0 items-center">
              <Icon size="base" color="tertiary" aria-hidden />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <p className="text-sm">
        <span className="text-muted-foreground">Best for: </span>
        {explanation.bestFor}
      </p>
      {notice ? <Banner variant="warning">{notice}</Banner> : null}
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
    <div className="flex flex-col gap-3">
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
