import useLocalStorage from "@/src/components/useLocalStorage";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { type TraceTopicFacet } from "./useTraceTopics";
import { TopicBadge } from "@/src/features/topics/TopicBadge";
import { topicBadgeColor } from "@/src/features/topics/topic-map-colors";

/** Header variant 1l: collapsible per-facet summaries under the header badges. */
export function TraceTopicsSummaryStrip({
  facets,
  onOpenTopicsTab,
}: {
  facets: TraceTopicFacet[];
  onOpenTopicsTab: () => void;
}) {
  const [open, setOpen] = useLocalStorage("trace-topics-strip-open", true);
  return (
    <Accordion
      type="single"
      collapsible
      value={open ? "topics" : ""}
      onValueChange={(value) => setOpen(value === "topics")}
    >
      <Accordion.Item value="topics">
        <Accordion.Trigger size="sm">Topic summaries</Accordion.Trigger>
        <Accordion.Content>
          <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-1.5 pb-2">
            {facets.map((facet, index) => (
              <div key={facet.facetId} className="contents">
                <span className="text-muted-foreground text-xs">
                  {facet.name}
                </span>
                <TopicBadge
                  row={{
                    topicName: facet.topic?.name ?? null,
                    outcome: facet.outcome,
                  }}
                  color={facet.topic ? topicBadgeColor(index) : "primary"}
                  size="sm"
                />
                <span
                  className="text-foreground-secondary truncate text-xs"
                  title={facet.summary}
                >
                  {facet.summary}
                </span>
              </div>
            ))}
          </div>
          <div className="pb-2">
            <TextLink
              path=""
              value="Open Topics tab"
              onClick={onOpenTopicsTab}
            />
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}
