import { useState } from "react";
import { useElementSize } from "@/src/hooks/useElementSize";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { cn } from "@/src/utils/tailwind";
import { TopicsEmptyState } from "./TopicsEmptyState";
import { type Facet, type FacetTopic, facetTopicTones } from "./facet-topics";
import {
  topicToneSwatchColor,
  topicToneTileClasses,
  treemapSwatchColor,
  treemapTileClasses,
} from "./topic-map-colors";
import { layoutTreemap } from "./topic-treemap-layout";
import { TopicTraceList } from "./TopicTraceList";

const TILE_GAP = 8;
/** Tiles above this area (px²) get the stronger resting tint. */
const BIG_TILE_AREA = 30_000;

export function TopicTreemapView({
  projectId,
  facet,
  peekView,
  tracePanelRef,
  onGenerateTopics,
  canGenerateTopics,
  layout = "horizontal",
}: TopicTreemapViewProps) {
  const isVertical = layout === "vertical";
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  if (facet.topics.length === 0) {
    return (
      <TopicsEmptyState
        onGenerateTopics={onGenerateTopics}
        canGenerateTopics={canGenerateTopics}
      />
    );
  }
  const selected =
    facet.topics.find((topic) => topic.id === selectedTopicId) ??
    facet.topics[0];
  const rows = facet.rows.filter((row) => row.topicId === selected.id);
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        isVertical && "lg:flex-row",
      )}
    >
      <TopicTreemap
        facet={facet}
        selectedTopicId={selected.id}
        onSelectTopic={setSelectedTopicId}
        wide={isVertical}
      />
      <TopicTraceList
        key={selected.id}
        projectId={projectId}
        title={selected.name}
        swatchColor={swatchFor(facet, selected.id)}
        rows={rows}
        peekView={peekView}
        tracePanelRef={tracePanelRef}
        divider={isVertical ? "side" : "top"}
      />
    </div>
  );
}

function TopicTreemap({
  facet,
  selectedTopicId,
  onSelectTopic,
  wide,
}: {
  facet: Facet;
  selectedTopicId: string;
  onSelectTopic: (topicId: string) => void;
  /** Beside the trace list: takes most of the width and the full height. */
  wide: boolean;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const total = facet.rows.length;
  const tones = facetTopicTones(facet);
  function tileColors(topicId: string, big: boolean) {
    const tone = tones.get(topicId);
    return tone
      ? topicToneTileClasses(tone)
      : treemapTileClasses(
          facet.topics.findIndex((topic) => topic.id === topicId),
          big,
        );
  }
  const tiles = size
    ? layoutTreemap(facet.topics, size.width, size.height, TILE_GAP)
    : [];
  return (
    <section
      aria-label="Topics"
      ref={ref}
      className={cn(
        "relative m-4 min-h-48 min-w-0 shrink-0 basis-1/2",
        wide && "lg:basis-3/5",
      )}
    >
      {tiles.map(({ item, x, y, width, height }) => (
        <TopicTile
          key={item.id}
          topic={item}
          share={total > 0 ? item.count / total : 0}
          colors={tileColors(item.id, width * height > BIG_TILE_AREA)}
          isSelected={item.id === selectedTopicId}
          onSelect={onSelectTopic}
          rect={{ left: x, top: y, width, height }}
          tier={tileTier(width, height)}
        />
      ))}
    </section>
  );
}

type TileTier = "large" | "medium" | "small" | "tiny";

const COUNT_SIZE: Record<TileTier, string> = {
  large: "text-3xl",
  medium: "text-xl",
  small: "text-sm",
  tiny: "",
};

/** Larger tiles get larger type; small tiles drop the name, tiny ones drop everything. */
function tileTier(width: number, height: number): TileTier {
  if (width >= 240 && height >= 160) return "large";
  if (width >= 112 && height >= 80) return "medium";
  if (width >= 40 && height >= 32) return "small";
  return "tiny";
}

function TopicTile({
  topic,
  share,
  colors,
  isSelected,
  onSelect,
  rect,
  tier,
}: {
  topic: FacetTopic;
  share: number;
  colors: { tile: string; active: string; hover: string };
  isSelected: boolean;
  onSelect: (topicId: string) => void;
  rect: { left: number; top: number; width: number; height: number };
  tier: TileTier;
}) {
  function selectTopic() {
    onSelect(topic.id);
  }
  const shareLabel = `${Math.round(share * 100)}% of traces`;
  const renderTile = (triggerProps = {}) => (
    <button
      {...triggerProps}
      type="button"
      onClick={selectTopic}
      aria-pressed={isSelected}
      aria-label={`${topic.name}, ${topic.count} traces`}
      style={rect}
      className={cn(
        "absolute flex flex-col justify-between overflow-hidden rounded-md text-left",
        tier === "small" ? "p-2" : "p-3",
        isSelected
          ? cn(
              colors.active,
              "text-foreground outline-foreground outline-2 outline-offset-2",
            )
          : cn(
              colors.tile,
              colors.hover,
              "text-muted-foreground hover:text-foreground",
            ),
      )}
    >
      {tier === "large" || tier === "medium" ? (
        <span
          className={cn(
            "line-clamp-3 font-bold",
            tier === "large" ? "text-lg" : "text-sm",
          )}
        >
          {topic.name}
        </span>
      ) : null}
      {tier === "tiny" ? null : (
        <span className="flex flex-col gap-0.5">
          <span className={cn("font-bold tabular-nums", COUNT_SIZE[tier])}>
            {topic.count.toLocaleString()}
          </span>
          {tier === "large" ? (
            <span className="text-xs opacity-80">{shareLabel}</span>
          ) : null}
        </span>
      )}
    </button>
  );
  if (tier === "large" || tier === "medium") return renderTile();
  return (
    <CustomTooltip
      placement="top"
      content={
        <span className="ph-no-capture flex flex-col gap-0.5">
          <span className="font-bold">{topic.name}</span>
          <span className="text-muted-foreground text-xs">
            {topic.count.toLocaleString()} traces · {shareLabel}
          </span>
        </span>
      }
    >
      {({ getTriggerProps }) => renderTile(getTriggerProps())}
    </CustomTooltip>
  );
}

type TopicTreemapViewProps = {
  projectId: string;
  facet: Facet;
  peekView: DataTablePeekViewProps;
  tracePanelRef?: (element: HTMLElement | null) => void;
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
  /** horizontal: traces below the treemap. vertical: traces to the right. */
  layout?: "horizontal" | "vertical";
};

function swatchFor(facet: Facet, topicId: string) {
  const tone = facetTopicTones(facet).get(topicId);
  return tone
    ? topicToneSwatchColor(tone)
    : treemapSwatchColor(
        facet.topics.findIndex((topic) => topic.id === topicId),
      );
}
