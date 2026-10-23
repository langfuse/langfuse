/* eslint-disable @typescript-eslint/no-use-before-define */
import { useState } from "react";
import { useElementSize } from "@/src/hooks/useElementSize";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { cn } from "@/src/utils/tailwind";
import { TopicsEmptyState } from "./TopicsEmptyState";
import { type Facet, type FacetTopic } from "./facet-topics";
import {
  treemapSwatchColor,
  treemapTileClasses,
  UNASSIGNED_SWATCH_COLOR,
  unassignedTileClasses,
} from "./topic-map-colors";
import { layoutTreemap } from "./topic-treemap-layout";
import { TopicTraceList } from "./TopicTraceList";

const TILE_GAP = 8;
const UNASSIGNED_ID = "__unassigned";
/** Tiles above this area (px²) get the stronger resting tint. */
const BIG_TILE_AREA = 30_000;

const TILE_PADDING: Record<TileTier, string> = {
  large: "p-3",
  medium: "p-3",
  small: "p-2",
  tiny: "p-0",
};

/** Vertical padding, name line height and count block height (px) for tiers that show a count; share only on large. */
const PADDING_Y_PX = 24;
const NAME_LINE_PX = { large: 28, medium: 20 };
const FOOTER_PX = { large: 54, medium: 28 };
const NAME_CLAMP = ["line-clamp-1", "line-clamp-2", "line-clamp-3"];

const NAME_SIZE: Record<TileTier, string> = {
  large: "text-lg",
  medium: "text-sm",
  small: "text-xs",
  tiny: "",
};

const COUNT_SIZE: Record<TileTier, string> = {
  large: "text-3xl",
  medium: "text-xl",
  small: "",
  tiny: "",
};

export function TopicTreemapView({
  projectId,
  facet,
  peekView,
  onGenerateTopics,
  canGenerateTopics,
}: TopicTreemapViewProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  if (facet.topics.length === 0) {
    return (
      <TopicsEmptyState
        onGenerateTopics={onGenerateTopics}
        canGenerateTopics={canGenerateTopics}
      />
    );
  }
  const unassignedCount = facet.rows.filter((row) => !row.topicId).length;
  const topics: FacetTopic[] =
    unassignedCount > 0
      ? [
          ...facet.topics,
          {
            id: UNASSIGNED_ID,
            name: "Unassigned",
            description: "",
            count: unassignedCount,
          },
        ]
      : facet.topics;
  const selected =
    topics.find((topic) => topic.id === selectedTopicId) ?? topics[0];
  const selectedRowTopicId = selected.id === UNASSIGNED_ID ? null : selected.id;
  const rows = facet.rows.filter(
    (row) => (row.topicId ?? null) === selectedRowTopicId,
  );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <TopicTreemap
        facet={facet}
        topics={topics}
        selectedTopicId={selected.id}
        onSelectTopic={setSelectedTopicId}
      />
      <TopicTraceList
        key={selected.id}
        projectId={projectId}
        title={selected.name}
        description={selected.description}
        swatchColor={swatchFor(facet, selected.id)}
        rows={rows}
        peekView={peekView}
        divider="top"
      />
    </div>
  );
}

function TopicTreemap({
  facet,
  topics,
  selectedTopicId,
  onSelectTopic,
}: TopicTreemapProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const total = facet.rows.length;
  function tileColors(topicId: string, big: boolean) {
    if (topicId === UNASSIGNED_ID) return unassignedTileClasses;
    return treemapTileClasses(
      facet.topics.findIndex((topic) => topic.id === topicId),
      big,
    );
  }
  const tiles = size
    ? layoutTreemap(
        layoutWeights(topics),
        size.width,
        size.height,
        TILE_GAP,
      ).map((tile) => ({ ...tile, item: tile.item.topic }))
    : [];
  return (
    <section
      aria-label="Topics"
      ref={ref}
      className="relative m-4 min-h-48 min-w-0 shrink-0 basis-1/2"
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

function TopicTile(props: TopicTileProps) {
  const { topic, share, tier } = props;
  const shareLabel = `${Math.round(share * 100)}% of traces`;
  if (tier === "large" || tier === "medium") {
    return <TopicTileButton {...props} shareLabel={shareLabel} />;
  }
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
      {({ getTriggerProps }) => (
        <TopicTileButton
          {...props}
          shareLabel={shareLabel}
          triggerProps={getTriggerProps()}
        />
      )}
    </CustomTooltip>
  );
}

function TopicTileButton({
  topic,
  colors,
  isSelected,
  onSelect,
  rect,
  tier,
  shareLabel,
  triggerProps,
}: TopicTileButtonProps) {
  function selectTopic() {
    onSelect(topic.id);
  }
  const showCount = tier === "large" || tier === "medium";
  /** Name lines that fit above the count; small tiles show only the name. */
  const nameLines = showCount
    ? Math.min(
        3,
        Math.max(
          1,
          Math.floor(
            (rect.height - PADDING_Y_PX - FOOTER_PX[tier]) / NAME_LINE_PX[tier],
          ),
        ),
      )
    : 2;
  return (
    <button
      {...triggerProps}
      type="button"
      onClick={selectTopic}
      aria-pressed={isSelected}
      aria-label={`${topic.name}, ${topic.count} traces`}
      style={rect}
      className={cn(
        "absolute flex flex-col justify-between overflow-hidden rounded-md text-left",
        TILE_PADDING[tier],
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
      {tier !== "tiny" && (
        <span
          className={cn(
            NAME_CLAMP[nameLines - 1],
            "font-bold",
            NAME_SIZE[tier],
          )}
        >
          {topic.name}
        </span>
      )}
      {showCount && (
        <span className="flex flex-col gap-0.5">
          <span className={cn("font-bold tabular-nums", COUNT_SIZE[tier])}>
            {topic.count.toLocaleString()}
          </span>
          {(tier === "large" || topic.id === UNASSIGNED_ID) && (
            <span className="text-xs opacity-80">{shareLabel}</span>
          )}
        </span>
      )}
    </button>
  );
}

/** Unassigned never takes more than ~10% of the area; its tile still shows the real count. */
function layoutWeights(topics: FacetTopic[]) {
  const assigned = topics
    .filter((topic) => topic.id !== UNASSIGNED_ID)
    .reduce((sum, topic) => sum + topic.count, 0);
  return topics.map((topic) => ({
    topic,
    count:
      topic.id === UNASSIGNED_ID
        ? Math.min(topic.count, Math.max(1, assigned / 9))
        : topic.count,
  }));
}

function tileTier(width: number, height: number): TileTier {
  if (width >= 240 && height >= 160) return "large";
  if (width >= 112 && height >= 96) return "medium";
  if (width >= 40 && height >= 32) return "small";
  return "tiny";
}

function swatchFor(facet: Facet, topicId: string) {
  if (topicId === UNASSIGNED_ID) return UNASSIGNED_SWATCH_COLOR;
  return treemapSwatchColor(
    facet.topics.findIndex((topic) => topic.id === topicId),
  );
}

type TopicTreemapViewProps = {
  projectId: string;
  facet: Facet;
  peekView: DataTablePeekViewProps;
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
};

type TopicTreemapProps = {
  facet: Facet;
  topics: FacetTopic[];
  selectedTopicId: string;
  onSelectTopic: (topicId: string) => void;
};

type TileTier = "large" | "medium" | "small" | "tiny";

type TopicTileProps = {
  topic: FacetTopic;
  share: number;
  colors: { tile: string; active: string; hover: string };
  isSelected: boolean;
  onSelect: (topicId: string) => void;
  rect: { left: number; top: number; width: number; height: number };
  tier: TileTier;
};

type TopicTileButtonProps = TopicTileProps & {
  shareLabel: string;
  triggerProps?: Record<string, unknown>;
};
