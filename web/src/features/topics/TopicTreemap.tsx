import { useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { ZoomOut } from "@langfuse/icons";
import { useElementSize } from "@/src/hooks/useElementSize";
import { usePanZoomGestures } from "@/src/hooks/usePanZoomGestures";
import { type PanZoomAnchor } from "@/src/utils/panZoomGestures";
import { Button } from "@/src/components/design-system/Button/Button";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { cn } from "@/src/utils/tailwind";
import { compactNumberFormatter } from "@/src/utils/numbers";
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
/** Zoom multiplies the layout height at a fixed width, so every tile stays reachable by scrolling down. */
const MAX_ZOOM = 8;
/** The panel width less 1rem a side, whether or not the gutter holds a scrollbar. */
const TILES_WIDTH = "w-[min(100%,100cqw_-_2rem)]";

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
const COUNT_PX = { large: 36, medium: 28, small: 20, tiny: 0 };
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
  small: "text-sm",
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
  const countFits = tier !== "tiny" && needed <= withCount;
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
  const showShare =
    tier === "large" || (tier === "medium" && topic.id === UNASSIGNED_TOPIC_ID);
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
            {compactNumberFormatter(
              topic.count,
              topic.count >= 100_000 ? 0 : 1,
            )}
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
  // Tap-to-preview tiles skip the tooltip; on desktop a capped tile keeps it to explain its size.
  if (previewOnSelect || ((tier === "large" || tier === "medium") && !capped)) {
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

function layoutTiles(topics: TopicDisplay[], width: number, height: number) {
  return layoutTreemap(layoutWeights(topics), width, height, TILE_GAP).map(
    (tile) => ({
      ...tile,
      item: tile.item.topic,
      capped: tile.item.count < tile.item.topic.count,
    }),
  );
}

export function TopicTreemap({
  total,
  topics,
  selectedTopicId,
  onSelectTopic,
  previewOnSelect = false,
}: TopicTreemapProps) {
  /** The visible span of the tiles when the tile was tapped, in px from the top of the tiles. */
  const [preview, setPreview] = useState<{
    id: string;
    visibleTop: number;
    visibleBottom: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewportRef, viewport] = useElementSize<HTMLDivElement>();
  const contentRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const layoutHeight = viewport ? viewport.height * zoom : 0;
  const tiles = viewport
    ? layoutTiles(topics, viewport.width, layoutHeight)
    : [];
  /** Where the card sits, derived from the current tile so it follows a re-layout. */
  function previewPlacement() {
    const tile = tiles.find((candidate) => candidate.item.id === preview?.id);
    if (!preview || !tile) return null;
    const visibleTop = Math.max(0, preview.visibleTop);
    const visibleBottom = Math.min(layoutHeight, preview.visibleBottom);
    const top = Math.max(tile.y, visibleTop);
    const bottom = Math.min(tile.y + tile.height, visibleBottom);
    const anchor = top < bottom ? (top + bottom) / 2 : tile.y + tile.height / 2;
    return {
      topic: tile.item,
      anchor,
      above: anchor > (visibleTop + visibleBottom) / 2,
    };
  }
  const placement = previewPlacement();
  function selectTopic(topicId: string) {
    const scroller = scrollRef.current;
    const section = contentRef.current;
    if (previewOnSelect && preview?.id !== topicId && scroller && section) {
      const visibleTop =
        scroller.getBoundingClientRect().top -
        section.getBoundingClientRect().top;
      setPreview({
        id: topicId,
        visibleTop,
        visibleBottom: visibleTop + scroller.clientHeight,
      });
      return;
    }
    setPreview(null);
    onSelectTopic(topicId);
  }
  function dismissPreview(event: MouseEvent<HTMLElement>) {
    if (event.target === event.currentTarget) setPreview(null);
  }
  function zoomAt(levels: number, anchor: PanZoomAnchor) {
    const scroller = scrollRef.current;
    const next = Math.min(MAX_ZOOM, Math.max(1, zoom * 2 ** levels));
    const section = contentRef.current;
    if (!scroller || !section || !viewport || next === zoom) return;
    const bounds = scroller.getBoundingClientRect();
    const origin = section.getBoundingClientRect();
    const x = bounds.left + anchor.x * bounds.width - origin.left;
    const y = bounds.top + anchor.y * bounds.height - origin.top;
    const nextHeight = viewport.height * next;
    // The layout reflows at the new height, so follow the tile under the point, not its height fraction.
    const aimed = tiles.find(
      (tile) =>
        x >= tile.x &&
        x <= tile.x + tile.width &&
        y >= tile.y &&
        y <= tile.y + tile.height,
    );
    const moved =
      aimed &&
      layoutTiles(topics, viewport.width, nextHeight).find(
        (tile) => tile.item.id === aimed.item.id,
      );
    const nextY =
      aimed && moved
        ? moved.y + ((y - aimed.y) / aimed.height) * moved.height
        : (y / layoutHeight) * nextHeight;
    flushSync(() => {
      setZoom(next);
      setPreview(null);
    });
    scroller.scrollTop += nextY - y;
  }
  function resetZoom() {
    setZoom(1);
    setPreview(null);
  }
  usePanZoomGestures({
    target: scrollRef,
    pointerPan: false,
    touchPinch: true,
    canPan: () => false,
    onZoom: zoomAt,
  });
  return (
    // The container's width includes the scrollbar gutter, so the tiles can end 1rem from its edge.
    <div className="@container flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className={cn(
          // A stable gutter keeps the tile width the same when zoom adds a scrollbar.
          // It sits in the right padding, so the tiles line up with the controls above.
          "relative min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-hidden py-4 pl-4 [scrollbar-gutter:stable]",
          zoom > 1 ? "overflow-y-auto" : "overflow-y-hidden",
        )}
      >
        {/* Inset by the padding, so it measures the visible tile area. */}
        <div
          ref={viewportRef}
          aria-hidden
          className="pointer-events-none invisible absolute top-4 bottom-4 left-4 w-[min(100%_-_1rem,100cqw_-_2rem)]"
        />
        {zoom > 1 && (
          <div
            className={cn(
              "sticky top-4 z-1 flex h-0 items-start justify-end",
              TILES_WIDTH,
            )}
          >
            <div className="p-2">
              <Button
                text="Reset zoom"
                icon={ZoomOut}
                variant="outline"
                size="sm"
                onClick={resetZoom}
              />
            </div>
          </div>
        )}
        <section
          aria-label="Topics"
          ref={contentRef}
          className={cn("relative", TILES_WIDTH)}
          style={{ height: layoutHeight }}
          onClick={dismissPreview}
        >
          {tiles.map(({ item, capped, x, y, width, height }) => (
            <TopicTile
              key={item.id}
              topic={item}
              share={total > 0 ? item.count / total : 0}
              colors={
                width * height > BIG_TILE_AREA
                  ? item.tiles.big
                  : item.tiles.small
              }
              isSelected={item.id === (preview?.id ?? selectedTopicId)}
              onSelect={selectTopic}
              rect={{ left: x, top: y, width, height }}
              tier={tileTier(width, height)}
              previewOnSelect={previewOnSelect}
              capped={capped}
            />
          ))}
          {placement && (
            <div
              className="pointer-events-none absolute right-2 left-2"
              style={
                placement.above
                  ? { bottom: layoutHeight - placement.anchor }
                  : { top: placement.anchor }
              }
            >
              <TopicPreviewCard topic={placement.topic} total={total} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
