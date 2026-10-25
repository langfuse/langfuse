import { useState, type MouseEvent } from "react";
import { useElementSize } from "@/src/hooks/useElementSize";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { cn } from "@/src/utils/tailwind";
import { type TopicDisplay } from "./prepare-topic-display";
import { layoutTreemap } from "./topic-treemap-layout";
import { TopicPreviewCard } from "./TopicPreviewCard";

type TopicTreemapProps = {
  total: number;
  topics: TopicDisplay[];
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string) => void;
  previewOnSelect?: boolean;
};

type TileTier = "large" | "medium" | "small" | "tiny";

type TopicTileProps = {
  previewOnSelect: boolean;
  topic: TopicDisplay;
  share: number;
  colors: TopicDisplay["tiles"]["small"];
  isSelected: boolean;
  onSelect: (topicId: string) => void;
  rect: { left: number; top: number; width: number; height: number };
  tier: TileTier;
};

type TopicTileButtonProps = TopicTileProps & {
  shareLabel: string;
  triggerProps?: Record<string, unknown>;
};

const TILE_GAP = 8;
/** Tiles above this area (px²) get the stronger resting tint. */
const BIG_TILE_AREA = 30_000;

const TILE_PADDING: Record<TileTier, string> = {
  large: "p-3",
  medium: "p-3",
  small: "p-2",
  tiny: "p-0",
};

/** Vertical padding, name line height and count+share block height (px) for tiers that show a name. */
const PADDING_Y_PX = 24;
const NAME_LINE_PX = { large: 28, medium: 20 };
const FOOTER_PX = { large: 54, medium: 46 };
const NAME_CLAMP = ["line-clamp-1", "line-clamp-2", "line-clamp-3"];

const COUNT_SIZE: Record<TileTier, string> = {
  large: "text-3xl",
  medium: "text-xl",
  small: "text-sm",
  tiny: "",
};

function tileTier(width: number, height: number): TileTier {
  if (width >= 240 && height >= 160) return "large";
  if (width >= 112 && height >= 96) return "medium";
  if (width >= 40 && height >= 32) return "small";
  return "tiny";
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
  const showName = tier === "large" || tier === "medium";
  /** Name lines that fit above the count. */
  const nameLines = showName
    ? Math.min(
        3,
        Math.max(
          1,
          Math.floor(
            (rect.height - PADDING_Y_PX - FOOTER_PX[tier]) / NAME_LINE_PX[tier],
          ),
        ),
      )
    : 0;
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
      {showName && (
        <span
          className={cn(
            NAME_CLAMP[nameLines - 1],
            "font-bold",
            tier === "large" ? "text-lg" : "text-sm",
          )}
        >
          {topic.name}
        </span>
      )}
      {tier !== "tiny" && (
        <span className="flex flex-col gap-0.5">
          <span className={cn("font-bold tabular-nums", COUNT_SIZE[tier])}>
            {topic.count.toLocaleString()}
          </span>
          {showName && <span className="text-xs opacity-80">{shareLabel}</span>}
        </span>
      )}
    </button>
  );
}

function TopicTile(props: TopicTileProps) {
  const { topic, share, tier, previewOnSelect } = props;
  const shareLabel = `${Math.round(share * 100)}% of traces`;
  if (previewOnSelect || tier === "large" || tier === "medium") {
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

export function TopicTreemap({
  total,
  topics,
  selectedTopicId,
  onSelectTopic,
  previewOnSelect = false,
}: TopicTreemapProps) {
  const [previewedId, setPreviewedId] = useState<string | null>(null);
  const [ref, size] = useElementSize<HTMLDivElement>();
  const tiles = size
    ? layoutTreemap(topics, size.width, size.height, TILE_GAP)
    : [];
  const previewedTopic = topics.find((topic) => topic.id === previewedId);
  const previewedTile = tiles.find((tile) => tile.item.id === previewedId);
  const previewAnchor = previewedTile
    ? previewedTile.y + previewedTile.height / 2
    : 0;
  function selectTopic(topicId: string) {
    if (previewOnSelect && previewedId !== topicId) {
      setPreviewedId(topicId);
      return;
    }
    setPreviewedId(null);
    onSelectTopic(topicId);
  }
  function dismissPreview(event: MouseEvent<HTMLElement>) {
    if (event.target === event.currentTarget) setPreviewedId(null);
  }
  return (
    <section
      aria-label="Topics"
      ref={ref}
      className="relative h-full min-h-0 min-w-0 flex-1"
      onClick={dismissPreview}
    >
      {tiles.map(({ item, x, y, width, height }) => (
        <TopicTile
          key={item.id}
          topic={item}
          share={total > 0 ? item.count / total : 0}
          colors={
            width * height > BIG_TILE_AREA ? item.tiles.big : item.tiles.small
          }
          isSelected={item.id === (previewedId ?? selectedTopicId)}
          onSelect={selectTopic}
          rect={{ left: x, top: y, width, height }}
          tier={tileTier(width, height)}
          previewOnSelect={previewOnSelect}
        />
      ))}
      {previewedTopic && (
        <div
          className="pointer-events-none absolute right-2 left-2"
          style={
            size && previewAnchor > size.height / 2
              ? { bottom: size.height - previewAnchor }
              : { top: previewAnchor }
          }
        >
          <TopicPreviewCard topic={previewedTopic} total={total} />
        </div>
      )}
    </section>
  );
}
