import { useState } from "react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { BarChart } from "@/src/components/design-system/charts/BarChart/BarChart";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Skeleton } from "@/src/components/ui/skeleton";
import { TopicBadge } from "@/src/features/topics/TopicBadge";
import { topicBadgeColor } from "@/src/features/topics/topic-map-colors";
import { api } from "@/src/utils/api";
import { topicsPageHref, topicTracesHref } from "./topicLinks";
import {
  TRACE_TOPICS_HEADER_VARIANTS,
  type TraceTopicFacet,
  useTraceTopicsHeaderVariant,
} from "./useTraceTopics";

const ALL_FACETS = "all";

/** Trace detail "Topics" tab: all facets stacked (1m) or one facet with its topic context (1n). */
export function TraceTopicsTab({
  projectId,
  traceId,
  facets,
}: {
  projectId: string;
  traceId: string;
  facets: TraceTopicFacet[];
}) {
  const [selected, setSelected] = useState(ALL_FACETS);
  const [headerVariant, setHeaderVariant] = useTraceTopicsHeaderVariant();
  const facetIndex = facets.findIndex((facet) => facet.facetId === selected);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={selected} onValueChange={setSelected}>
          <Tabs.List variant="inset" size="sm" aria-label="Facets">
            <Tabs.Trigger value={ALL_FACETS} label="All" />
            {facets.map((facet) => (
              <Tabs.Trigger
                key={facet.facetId}
                value={facet.facetId}
                label={facet.name}
              />
            ))}
          </Tabs.List>
        </Tabs>
        <Tabs
          value={headerVariant}
          onValueChange={(value) =>
            setHeaderVariant(
              value as (typeof TRACE_TOPICS_HEADER_VARIANTS)[number],
            )
          }
        >
          <Tabs.List variant="inset" size="sm" aria-label="Header preview">
            {TRACE_TOPICS_HEADER_VARIANTS.map((variant) => (
              <Tabs.Trigger
                key={variant}
                value={variant}
                label={`Header: ${variant}`}
              />
            ))}
          </Tabs.List>
        </Tabs>
      </div>
      {facetIndex < 0 ? (
        facets.map((facet, index) => (
          <section key={facet.facetId} className="flex flex-col gap-1.5">
            <h3 className="text-sm font-bold">{facet.name}</h3>
            <div className="flex flex-wrap items-center gap-3">
              <TopicBadge
                row={{
                  topicName: facet.topic?.name ?? null,
                  outcome: facet.outcome,
                }}
                color={facet.topic ? topicBadgeColor(index) : "primary"}
                size="default"
              />
              {facet.topic && (
                <TextLink
                  path={topicTracesHref(
                    projectId,
                    facet.name,
                    facet.topic.name,
                  )}
                  value="Filter traces"
                />
              )}
              <TextLink
                path={topicsPageHref(projectId, facet.facetId)}
                value="Open in Topics"
              />
            </div>
            <p className="text-foreground-secondary text-sm">{facet.summary}</p>
          </section>
        ))
      ) : (
        <FacetDetail
          projectId={projectId}
          traceId={traceId}
          facet={facets[facetIndex]}
          color={topicBadgeColor(facetIndex)}
        />
      )}
    </div>
  );
}

function FacetDetail({
  projectId,
  traceId,
  facet,
  color,
}: {
  projectId: string;
  traceId: string;
  facet: TraceTopicFacet;
  color: ReturnType<typeof topicBadgeColor>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="font-bold">Summary:</span> {facet.summary}
      </p>
      {facet.topic ? (
        <TopicContext
          projectId={projectId}
          traceId={traceId}
          facet={facet}
          topic={facet.topic}
          color={color}
        />
      ) : (
        <div className="flex items-center gap-2">
          <TopicBadge
            row={{ topicName: null, outcome: facet.outcome }}
            color="primary"
            size="default"
          />
          <span className="text-muted-foreground text-xs">
            This trace is not part of a topic for this facet.
          </span>
        </div>
      )}
    </div>
  );
}

function TopicContext({
  projectId,
  traceId,
  facet,
  topic,
  color,
}: {
  projectId: string;
  traceId: string;
  facet: TraceTopicFacet;
  topic: NonNullable<TraceTopicFacet["topic"]>;
  color: ReturnType<typeof topicBadgeColor>;
}) {
  const context = api.topics.topicContext.useQuery({
    projectId,
    facetId: facet.facetId,
    topicId: topic.id,
    traceId,
  });
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge
          label={topic.name}
          text={
            context.data ? `${context.data.totalCount} traces in 7 days` : "…"
          }
          color={color}
          shouldWrap
        />
        <div className="flex items-center gap-3">
          <TextLink
            path={topicsPageHref(projectId, facet.facetId)}
            value="Open in Topics"
          />
          <TextLink
            path={topicTracesHref(projectId, facet.name, topic.name)}
            value="Filter traces"
          />
        </div>
      </div>
      {topic.description && (
        <p className="text-foreground-secondary text-sm">{topic.description}</p>
      )}
      {context.data ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Last 7 days</span>
            <div className="h-24">
              <BarChart
                data={context.data.days.map((day) => ({
                  label: new Date(`${day.day}T00:00:00Z`).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", timeZone: "UTC" },
                  ),
                  value: day.count,
                }))}
                ariaLabel={`Traces in ${topic.name} per day`}
                tooltipValueLabel="Traces"
              />
            </div>
          </div>
          {context.data.examples.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">
                Other traces in this topic
              </span>
              {context.data.examples.map((example) => (
                <div
                  key={example.traceId}
                  className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 border-t py-1.5"
                >
                  <TextLink
                    path={`/project/${encodeURIComponent(projectId)}/traces/${encodeURIComponent(example.traceId)}`}
                    value={example.traceId}
                  />
                  <span
                    className="text-foreground-secondary truncate text-xs"
                    title={example.summary}
                  >
                    {example.summary}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <Skeleton className="h-24 w-full" />
      )}
    </div>
  );
}
