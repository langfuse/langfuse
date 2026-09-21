/** Trace totals, session/user links, scores and tags on one line, above the panels. */

import { Search } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { groupScoresByName } from "@/src/components/grouped-score-badge";
import { ScoreBadge } from "@/src/components/ScoreBadge/ScoreBadge";
import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { TagButton } from "@/src/features/tag/components/TagButton";
import {
  SessionBadge,
  UserIdBadge,
} from "@/src/features/traces/components/TraceMetadataBadges";
import { LatencyBadge } from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import {
  CostBadge,
  UsageBadge,
} from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { aggregateTraceMetrics } from "@/src/features/traces/fns/traceAggregation";

type TraceHeaderItem = {
  key: string;
  searchText: string;
  content: ReactNode;
};

const formatScoreValue = (score: {
  stringValue?: string | null;
  value: number | null;
}) => score.stringValue ?? score.value?.toFixed(2) ?? "";

export function TraceHeader() {
  const { trace, observations, mergedScores } = useTraceData();
  const [search, setSearch] = useState("");

  const aggregatedMetrics = useMemo(
    () => aggregateTraceMetrics(observations),
    [observations],
  );

  const traceScores = useMemo(
    () => mergedScores.filter((score) => score.observationId === null),
    [mergedScores],
  );

  const items: TraceHeaderItem[] = [
    {
      key: "latency",
      searchText: `latency ${trace.latency ?? ""}`,
      content: <LatencyBadge latencySeconds={trace.latency ?? null} />,
    },
  ];

  if (aggregatedMetrics.totalCost != null && aggregatedMetrics.costDetails) {
    items.push({
      key: "cost",
      searchText: `cost ${aggregatedMetrics.totalCost}`,
      content: (
        <CostBadge
          totalCost={aggregatedMetrics.totalCost}
          costDetails={aggregatedMetrics.costDetails}
        />
      ),
    });
  }

  if (aggregatedMetrics.hasGenerationLike && aggregatedMetrics.usageDetails) {
    items.push({
      key: "tokens",
      searchText: `tokens usage ${aggregatedMetrics.inputUsage} ${aggregatedMetrics.outputUsage} ${aggregatedMetrics.totalUsage}`,
      content: (
        <UsageBadge
          inputUsage={aggregatedMetrics.inputUsage}
          outputUsage={aggregatedMetrics.outputUsage}
          totalUsage={aggregatedMetrics.totalUsage}
          usageDetails={aggregatedMetrics.usageDetails}
        />
      ),
    });
  }

  if (trace.sessionId) {
    items.push({
      key: "session",
      searchText: `session ${trace.sessionId}`,
      content: (
        <SessionBadge sessionId={trace.sessionId} projectId={trace.projectId} />
      ),
    });
  }

  if (trace.userId) {
    items.push({
      key: "user",
      searchText: `user ${trace.userId}`,
      content: (
        <UserIdBadge userId={trace.userId} projectId={trace.projectId} />
      ),
    });
  }

  Object.entries(groupScoresByName(traceScores))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .forEach(([name, scores]) => {
      items.push({
        key: `score:${name}`,
        searchText: `score ${name} ${scores.map(formatScoreValue).join(" ")}`,
        content: <ScoreBadge name={name} scores={scores} />,
      });
    });

  trace.tags.forEach((tag) => {
    items.push({
      key: `tag:${tag}`,
      searchText: `tag ${tag}`,
      content: <TagButton tag={tag} loading={false} viewOnly />,
    });
  });

  return (
    <div className="shrink-0 border-b px-3 py-2">
      <SingleLineOverflowList
        items={items}
        additionalOverflowCount={0}
        getKey={(item) => item.key}
        renderItem={(item) => item.content}
        renderOverflow={({ hiddenItems, overflowItemCount }) => {
          const normalizedSearch = search.trim().toLocaleLowerCase();
          const filteredItems = normalizedSearch
            ? hiddenItems.filter((item) =>
                item.searchText.toLocaleLowerCase().includes(normalizedSearch),
              )
            : hiddenItems;

          return (
            <Popover
              onOpenChange={(open) => {
                if (!open) setSearch("");
              }}
            >
              <PopoverTrigger asChild>
                <BadgeShell asChild color="neutral">
                  <button
                    type="button"
                    aria-label={`Show ${overflowItemCount} hidden trace details`}
                  >
                    +{overflowItemCount}
                  </button>
                </BadgeShell>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80 p-0"
                aria-label="All trace details"
              >
                <div className="relative border-b p-2">
                  <Search className="text-muted-foreground absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search trace details"
                    aria-label="Search trace details"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div
                  role="region"
                  aria-label="Trace detail results"
                  className="flex max-h-72 flex-col items-start gap-1.5 overflow-y-auto p-2"
                >
                  {filteredItems.length > 0 ? (
                    filteredItems.map((item) => (
                      <span
                        key={item.key}
                        className="flex max-w-full items-center"
                      >
                        {item.content}
                      </span>
                    ))
                  ) : (
                    <p className="text-muted-foreground px-2 py-4 text-xs">
                      No trace details found.
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          );
        }}
      />
    </div>
  );
}
