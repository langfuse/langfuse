import { useState, type MouseEvent } from "react";
import { useElementSize } from "@/src/hooks/useElementSize";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { cn } from "@/src/utils/tailwind";
import {
  type TopicDisplay,
  UNASSIGNED_TOPIC_ID,
} from "./prepare-topic-display";
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
  /** Drawn smaller than its share of traces. */
  capped: boolean;
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

/** Padding (px), name line height, approximate bold character width and count line height per tier. */
const PADDING_PX = { large: 24, medium: 24, small: 16, tiny: 0 };
const NAME_LINE_PX = { large: 28, medium: 20, small: 16, tiny: 16 };
const NAME_CHAR_PX = { large: 10, medium: 7.6, small: 6.8, tiny: 6.8 };
const COUNT_PX = { large: 36, medium: 28, small: 0, tiny: 0 };
/** Share caption: text-xs line height, approximate character width and the gap above it. */
const SHARE_LINE_PX = 16;
const SHARE_CHAR_PX = 6;
const SHARE_GAP_PX = 2;
const NAME_CLAMP = [
  "line-clamp-1",
  "line-clamp-2",
  "line-clamp-3",
  "line-clamp-4",
  "line-clamp-5",
  "line-clamp-6",
];

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

function tileTier(width: number, height: number): TileTier {
  if (width >= 240 && height >= 160) return "large";
  if (width >= 112 && height >= 96) return "medium";
  if (width >= 40 && height >= 32) return "small";
  return "tiny";
}

/** The name comes first: the count (and share caption) shows only when the full name still fits above it. */
function tileLabelLayout(
  name: string,
  rect: { width: number; height: number },
  tier: TileTier,
  shareLabel: string | null,
) {
  const contentWidth = rect.width - PADDING_PX[tier];
  const lines = (reserved: number) =>
    Math.floor(
      (rect.height - PADDING_PX[tier] - reserved) / NAME_LINE_PX[tier],
    );
  const perLine = Math.max(1, Math.floor(contentWidth / NAME_CHAR_PX[tier]));
  const needed = Math.ceil(name.length / perLine);
  const shareLines = shareLabel
    ? Math.ceil(
        shareLabel.length /
          Math.max(1, Math.floor(contentWidth / SHARE_CHAR_PX)),
      )
    : 0;
  const footer =
    COUNT_PX[tier] +
    (shareLines > 0 ? SHARE_GAP_PX + shareLines * SHARE_LINE_PX : 0);
  const withCount = lines(footer);
  const countFits =
    (tier === "large" || tier === "medium") && needed <= withCount;
  const available = countFits ? withCount : lines(0);
  return {
    showCount: countFits,
    nameLines: Math.min(
      NAME_CLAMP.length,
      Math.max(1, Math.min(needed, available)),
    ),
  };
}

/** Unassigned never takes more than ~10% of the area; its tile still shows the real count. */
function layoutWeights(topics: TopicDisplay[]) {
  const assigned = topics
    .filter((topic) => topic.id !== UNASSIGNED_TOPIC_ID)
    .reduce((sum, topic) => sum + topic.count, 0);
  return topics.map((topic) => ({
    topic,
    count:
      topic.id === UNASSIGNED_TOPIC_ID
        ? Math.min(topic.count, Math.max(1, assigned / 9))
        : topic.count,
  }));
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
  const showShare = tier === "large" || topic.id === UNASSIGNED_TOPIC_ID;
  const { showCount, nameLines } = tileLabelLayout(
    topic.name,
    rect,
    tier,
    showShare ? shareLabel : null,
  );
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
            "mask-r-from-80% font-bold",
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
          {showShare && (
            <span className="text-xs opacity-80">{shareLabel}</span>
          )}
        </span>
      )}
    </button>
  );
}

function TopicTile(props: TopicTileProps) {
  const { topic, share, tier, previewOnSelect, capped } = props;
  const percentLabel = `${Math.round(share * 100)}% of traces`;
  const shareLabel = capped ? `${percentLabel} · shown smaller` : percentLabel;
  if ((previewOnSelect || tier === "large" || tier === "medium") && !capped) {
    return <TopicTileButton {...props} shareLabel={shareLabel} />;
  }
  return (
    <CustomTooltip
      placement="top"
      content={
        <span className="ph-no-capture flex flex-col gap-0.5">
          <span className="font-bold">{topic.name}</span>
          <span className="text-muted-foreground text-xs">
            {topic.count.toLocaleString()} traces · {percentLabel}
          </span>
          {capped && (
            <span className="text-muted-foreground text-xs">
              Shown smaller than its actual share so topics stay readable.
            </span>
          )}
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
    ? layoutTreemap(
        layoutWeights(topics),
        size.width,
        size.height,
        TILE_GAP,
      ).map((tile) => ({
        ...tile,
        item: tile.item.topic,
        capped: tile.item.count < tile.item.topic.count,
      }))
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
      {tiles.map(({ item, capped, x, y, width, height }) => (
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
          capped={capped}
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
