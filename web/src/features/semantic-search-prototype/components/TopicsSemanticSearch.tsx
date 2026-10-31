import { useState } from "react";
import { Sparkles, Telescope, TextSearch } from "@langfuse/icons";
import { Badge, BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Callout } from "@/src/components/design-system/Callout/Callout";
import { Progress } from "@/src/components/design-system/Progress/Progress";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { StatusMessage } from "@/src/components/design-system/StatusMessage/StatusMessage";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  coveragePercent,
  groupMatchesByTopic,
  LOW_COVERAGE_PERCENT,
  similarityBand,
  type TopicGroup,
} from "../lib/similarity";
import {
  type EmbeddingCoverage,
  type SearchMode,
  type SemanticMatch,
  type TopicSearchStatus,
} from "../types";

type TopicsSemanticSearchProps = {
  mode: SearchMode;
  query: string;
  /** The facet whose summaries are searched, e.g. "Intent". */
  facetLabel: string;
  status: TopicSearchStatus;
  suggestions: string[];
  onModeChange: (mode: SearchMode) => void;
  onQueryChange: (query: string) => void;
  onSubmit: (query: string) => void;
  onOpenTrace: (traceId: string) => void;
  /** `null` selects the outliers group. */
  onTopicSelect: (topicId: string | null) => void;
  onOpenInTracing: (query: string) => void;
};

/**
 * Search inside a Topics analysis. "Meaning" ranks traces by how close their
 * facet summary is to the query; "Keyword" is today's substring search.
 */
export function TopicsSemanticSearch(props: TopicsSemanticSearchProps) {
  const {
    mode,
    query,
    facetLabel,
    status,
    onModeChange,
    onQueryChange,
    onSubmit,
  } = props;
  const meaning = mode === "meaning";
  const [coverageDismissed, setCoverageDismissed] = useState(false);
  const coverage =
    status.kind === "results" || status.kind === "empty"
      ? status.coverage
      : null;
  const showCoverage =
    meaning &&
    !coverageDismissed &&
    coverage !== null &&
    coveragePercent(coverage) < LOW_COVERAGE_PERCENT;
  return (
    <section className="flex flex-col gap-3" aria-label="Search traces">
      <div className="flex items-center gap-2">
        <Tabs
          value={mode}
          onValueChange={(next) => onModeChange(next as SearchMode)}
        >
          <Tabs.List variant="inset" size="md" aria-label="Search mode">
            <Tabs.Trigger value="keyword" label="Keyword" icon={TextSearch} />
            <Tabs.Trigger value="meaning" label="Meaning" icon={Sparkles} />
          </Tabs.List>
        </Tabs>
        <div className="min-w-0 flex-1">
          <SearchInput
            value={query}
            onChange={onQueryChange}
            onSubmit={onSubmit}
            placeholder={
              meaning
                ? `Describe what users asked — searches ${facetLabel} summaries`
                : "Search summaries and trace IDs"
            }
          />
        </div>
      </div>
      {showCoverage ? (
        <CoverageNotice
          coverage={coverage}
          facetLabel={facetLabel}
          onModeChange={onModeChange}
          onDismiss={() => setCoverageDismissed(true)}
        />
      ) : null}
      {status.kind === "idle" && !meaning ? null : <SearchBody {...props} />}
    </section>
  );
}

function SearchBody({
  mode,
  query,
  facetLabel,
  status,
  suggestions,
  onModeChange,
  onQueryChange,
  onSubmit,
  onOpenTrace,
  onTopicSelect,
  onOpenInTracing,
}: TopicsSemanticSearchProps) {
  switch (status.kind) {
    case "idle":
      return (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            Matches traces whose {facetLabel} summary means the same thing, even
            when they share no words with your query.
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                icon={Sparkles}
                text={suggestion}
                onClick={() => {
                  onQueryChange(suggestion);
                  onSubmit(suggestion);
                }}
              />
            ))}
          </div>
        </div>
      );
    case "searching":
      return (
        <div
          role="status"
          className="text-muted-foreground flex items-center gap-2 text-xs"
        >
          <Spinner size="xs" variant="muted" />
          Searching {facetLabel} summaries by meaning…
        </div>
      );
    case "unavailable":
      return (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-4">
          <div className="flex items-center gap-2 text-sm">
            <Telescope size="base" aria-hidden />
            Search by meaning needs a finished Topics run
          </div>
          <p className="text-muted-foreground text-xs">
            Meaning search compares your query with the summaries Topics writes
            for each trace. Run an analysis first, or search by keyword now.
          </p>
          <Button
            variant="outline"
            size="sm"
            text="Search by keyword"
            onClick={() => onModeChange("keyword")}
          />
        </div>
      );
    case "error":
      return (
        <StatusMessage
          level="ERROR"
          size="compact"
          message="Couldn't search by meaning. Try again, or switch to keyword search."
        />
      );
    case "empty":
      return (
        <p role="status" className="text-muted-foreground text-sm">
          {mode === "meaning"
            ? `No traces close to “${query}”. Try broader wording.`
            : `No summaries contain “${query}”. Try searching by meaning.`}
        </p>
      );
    case "results": {
      const groups = groupMatchesByTopic(status.matches);
      return (
        <div className="flex flex-col gap-3">
          {groups.length > 1 ? (
            <TopicDistribution groups={groups} onTopicSelect={onTopicSelect} />
          ) : null}
          <ul className="flex flex-col divide-y rounded-md border">
            {status.matches.map((match) => (
              <MatchRow
                key={match.traceId}
                match={match}
                onOpenTrace={onOpenTrace}
              />
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2">
            <span role="status" className="text-muted-foreground text-xs">
              {mode === "meaning"
                ? `Top ${status.matches.length} by meaning`
                : `${status.matches.length} keyword matches`}
            </span>
            <Button
              variant="text"
              size="sm"
              text="Open all in Tracing"
              onClick={() => onOpenInTracing(query)}
            />
          </div>
        </div>
      );
    }
  }
}

function CoverageNotice({
  coverage,
  facetLabel,
  onModeChange,
  onDismiss,
}: {
  coverage: EmbeddingCoverage;
  facetLabel: string;
  onModeChange: (mode: SearchMode) => void;
  onDismiss: () => void;
}) {
  const percent = coveragePercent(coverage);
  return (
    <Callout
      variant="warning"
      align="middle"
      actions={[
        {
          type: "button",
          label: "Search by keyword",
          onClick: () => onModeChange("keyword"),
        },
      ]}
      onDismiss={onDismiss}
    >
      <p>
        Only {coverage.embedded.toLocaleString("en-US")} of{" "}
        {coverage.total.toLocaleString("en-US")} traces in this range have a
        summary for {facetLabel} ({percent}%). The rest can&apos;t match by
        meaning until Topics processes them.
      </p>
    </Callout>
  );
}

function TopicDistribution({
  groups,
  onTopicSelect,
}: {
  groups: TopicGroup[];
  onTopicSelect: (topicId: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Lands in</span>
      {groups.map((group) => (
        <BadgeShell key={group.topicId ?? "outliers"} asChild color="filled">
          <button type="button" onClick={() => onTopicSelect(group.topicId)}>
            {group.topicName}
            <span className="font-mono">{group.count}</span>
          </button>
        </BadgeShell>
      ))}
    </div>
  );
}

function MatchRow({
  match,
  onOpenTrace,
}: {
  match: SemanticMatch;
  onOpenTrace: (traceId: string) => void;
}) {
  return (
    <li className="flex items-start gap-3 px-3 py-2">
      {match.similarity !== null ? (
        <SimilarityMeter similarity={match.similarity} />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="ph-no-capture text-sm">{match.summary}</p>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Badge
            size="sm"
            color={match.topicId ? "violetTint" : "filled"}
            text={match.topicName ?? "Outlier"}
          />
          <span className="font-mono">{match.traceId}</span>
          <span>{match.seenAt}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        text="Open trace"
        onClick={() => onOpenTrace(match.traceId)}
      />
    </li>
  );
}

function SimilarityMeter({ similarity }: { similarity: number }) {
  const band = similarityBand(similarity);
  return (
    <div
      className="flex w-16 shrink-0 flex-col gap-1 pt-1"
      title={`Similarity ${band.percent}%`}
    >
      <span className="text-muted-foreground text-xs">{band.label}</span>
      <Progress value={band.percent} />
    </div>
  );
}
