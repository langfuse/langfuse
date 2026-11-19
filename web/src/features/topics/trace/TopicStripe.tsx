import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  scatterSwatchColor,
  UNASSIGNED_SWATCH_COLOR,
} from "@/src/features/topics/topic-map-colors";
import { type TopicStripeSegment } from "@/src/features/topics/trace/topic-stripe";
import { cn } from "@/src/utils/tailwind";

function segmentLabel(segment: TopicStripeSegment) {
  if (segment.kind === "topic") return segment.name;
  if (segment.kind === "more") return `${segment.topicCount} more topics`;
  return "Unassigned";
}

/** A thin stacked bar of one facet's topic shares; click a topic to filter by it. */
export function TopicStripe({
  facet,
  segments,
  selected,
  onToggle,
}: {
  facet: string;
  segments: TopicStripeSegment[];
  selected: Set<string>;
  onToggle: (topic: string) => void;
}) {
  const capture = usePostHogClientCapture();
  const topicCount = segments.reduce((sum, segment) => {
    if (segment.kind === "topic") return sum + 1;
    if (segment.kind === "more") return sum + segment.topicCount;
    return sum;
  }, 0);
  const anySelected = selected.size > 0;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-muted-foreground shrink-0 text-xs">{facet}</span>
      <div className="ph-no-capture flex h-1.5 min-w-0 flex-1 gap-px overflow-hidden rounded-full">
        {segments.map((segment) => {
          const topic = segment.kind === "topic" ? segment.name : null;
          const name = segmentLabel(segment);
          const isSelected = topic !== null && selected.has(topic);
          return (
            <CustomTooltip
              key={`${segment.kind}-${name}`}
              content={
                <span className="ph-no-capture">
                  {name} · {segment.count.toLocaleString()}
                </span>
              }
            >
              {({ getTriggerProps }) => (
                <button
                  type="button"
                  {...getTriggerProps({
                    onClick:
                      topic !== null
                        ? () => {
                            capture("topics:stripe_toggle", {
                              isV4: true,
                              isSelected: !isSelected,
                              topicCount,
                            });
                            onToggle(topic);
                          }
                        : undefined,
                  })}
                  aria-label={`${name}, ${segment.count}`}
                  aria-pressed={topic !== null ? isSelected : undefined}
                  aria-disabled={topic === null}
                  style={{
                    flexGrow: segment.count,
                    flexBasis: 0,
                    backgroundColor:
                      segment.kind === "topic"
                        ? scatterSwatchColor(segment.slot)
                        : UNASSIGNED_SWATCH_COLOR,
                  }}
                  className={cn(
                    "focus-visible:ring-ring h-full min-w-1 transition-opacity focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset",
                    topic !== null
                      ? "cursor-pointer hover:opacity-70"
                      : "cursor-default",
                    anySelected && !isSelected && "opacity-30",
                  )}
                />
              )}
            </CustomTooltip>
          );
        })}
      </div>
    </div>
  );
}
