import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { useState } from "react";
import { ControlledHoverCard } from "@/src/components/design-system/ControlledHoverCard/ControlledHoverCard";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { DocPopupTrigger } from "@/src/components/layouts/doc-popup";
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

export type TopicStripeProps = {
  facet: string;
  segments: TopicStripeSegment[];
  selected: Set<string>;
  onToggle: (topic: string) => void;
  /** The facet's hover card: traces its map analysed, and the link to that map. */
  details: {
    analysed: number;
    total: number;
    mapName: string | null;
    href: string;
  };
};

/** A thin stacked bar of one facet's topic shares; click a topic to filter by it. */
export function TopicStripe({
  facet,
  segments,
  selected,
  onToggle,
  details,
}: TopicStripeProps) {
  const capture = usePostHogClientCapture();
  const topicCount = segments.reduce((sum, segment) => {
    if (segment.kind === "topic") return sum + 1;
    if (segment.kind === "more") return sum + segment.topicCount;
    return sum;
  }, 0);
  const anySelected = selected.size > 0;
  // Controlled so a tap opens the card too; hover cards never open on touch.
  const [cardOpen, setCardOpen] = useState(false);
  return (
    <div className="ph-no-capture flex min-w-0 items-center gap-2">
      <span className="flex shrink-0 items-center">
        <span className="text-muted-foreground text-xs">{facet}</span>
        <ControlledHoverCard
          open={cardOpen}
          onOpenChange={setCardOpen}
          placement="bottom-start"
          content={
            <div className="ph-no-capture flex w-64 flex-col gap-2 p-3">
              <p className="text-sm">
                {facet} · {details.analysed.toLocaleString()} of{" "}
                {details.total.toLocaleString()} traces analysed
              </p>
              <span>
                <TextLink
                  path={details.href}
                  value="Open in Topics →"
                  title={details.mapName ? `${details.mapName} map` : undefined}
                />
              </span>
            </div>
          }
        >
          {({ getTriggerProps }) => (
            <DocPopupTrigger
              triggerProps={getTriggerProps({
                onClick: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setCardOpen(!cardOpen);
                },
              })}
            />
          )}
        </ControlledHoverCard>
      </span>
      <div className="flex h-1.5 min-w-0 flex-1 gap-px overflow-hidden rounded-full">
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
                      segment.kind === "topic" && segment.slot >= 0
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
