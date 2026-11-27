import {
  round,
  textWidth,
} from "@/src/components/illustrations/engine/projection";
import {
  GRID,
  PILE_COLORS,
  PLANE,
  type PileColor,
  type SheetColor,
} from "./topic-piles-geometry";
import {
  CARD,
  PILE_PITCH,
  READING,
  labelingFrame,
  labelingTimeline,
  type LabeledTrace,
  type TraceCardFrame,
} from "./topic-piles-labeling";
import { TopicPilesScene } from "./TopicPilesScene";
import { useLoopTime } from "./useLoopTime";

// The drawing's box in css px, centred on everything the loop shows.
const BOX = { width: 720, height: 480 };
const MIDDLE = { x: 312, y: 44 };
const TAB = { height: 36, padLeft: 17, padRight: 14 };
const MAIN_FONT_SIZE = 19.5;
const SMALL_FONT_SIZE = 16.5;
const TEXT_INSET = 14;
const LINE_HEIGHT = 22;

const INK: Record<PileColor, string> = {
  violet: "fill-category-violet-foreground",
  blue: "fill-category-blue-foreground",
  amber: "fill-category-amber-foreground",
};

/** Decorative: grey traces are read one at a time next to the facet's tab, take their intent and colour, and stack up as named topics. */
export function TopicPilesLabeling({
  facet,
  topics,
  traces,
}: TopicPilesLabelingProps) {
  const timeline = labelingTimeline(traces);
  const seconds = useLoopTime(timeline.loop, timeline.still);
  const frame = labelingFrame(timeline, seconds, topics.length);
  return (
    <TopicPilesScene
      box={BOX}
      middle={MIDDLE}
      drop={0}
      edges={{
        xs: topics.flatMap((_, index) => [
          index * PILE_PITCH,
          index * PILE_PITCH + CARD.width,
        ]),
        ys: [0, CARD.depth],
      }}
    >
      <g transform={PLANE}>
        {frame.piles.map((pile, index) => (
          <rect
            key={index}
            x={index * PILE_PITCH}
            y={0}
            width={CARD.width}
            height={CARD.depth}
            rx={1}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray="6 6"
            opacity={round(pile.spot)}
            className="stroke-foreground-tertiary"
          />
        ))}
        <rect
          x={READING.x}
          y={READING.y}
          width={CARD.width}
          height={CARD.depth}
          rx={1}
          strokeWidth={1.5}
          opacity={round(frame.square)}
          className="fill-muted stroke-border-contrast"
        />
        <FacetTab text={facet} />
      </g>
      <g opacity={round(1 - frame.back)}>
        {topics
          .map((topic, index) => {
            const pile = frame.piles[index];
            if (!pile?.sheets) return null;
            const x = index * PILE_PITCH;
            const color = colorOf(index);
            return (
              <TopicPilesScene.Pile
                key={topic.name}
                rect={{ x, y: 0, ...CARD }}
                sheets={pile.sheets}
                color={color}
                lift={0}
                label={
                  <>
                    {pile.top !== null && frame.intents > 0 ? (
                      <g opacity={round(frame.intents)}>
                        <IntentLines
                          x={x}
                          y={0}
                          lines={traces[pile.top]?.intent ?? []}
                          written={Infinity}
                          color={color}
                        />
                      </g>
                    ) : null}
                    {frame.names > 0 ? (
                      <g opacity={round(frame.names)}>
                        <TopicLabel x={x} topic={topic} />
                      </g>
                    ) : null}
                  </>
                }
              />
            );
          })
          .reverse()}
      </g>
      {frame.cards.map((card) => {
        const trace = traces[card.index];
        return trace ? (
          <TraceCard key={card.index} card={card} trace={trace} />
        ) : null;
      })}
    </TopicPilesScene>
  );
}

function colorOf(topic: number) {
  return PILE_COLORS[topic % PILE_COLORS.length] ?? PILE_COLORS[0];
}

/** The facet being asked: a dark tab on the floor next to the reading square, level with its front edge. */
function FacetTab({ text }: FacetTabProps) {
  const x = READING.x + CARD.width + GRID / 2;
  const y = READING.y + CARD.depth - TAB.height;
  return (
    <>
      <rect
        x={x}
        y={y}
        width={TAB.padLeft + textWidth(text, MAIN_FONT_SIZE) + TAB.padRight}
        height={TAB.height}
        rx={1}
        className="fill-foreground"
      />
      <text
        x={x + TAB.padLeft}
        y={round(y + TAB.height / 2 + MAIN_FONT_SIZE * 0.34)}
        fontSize={MAIN_FONT_SIZE}
        className="fill-background"
      >
        {text}
      </text>
    </>
  );
}

/** One trace as a single sheet: grey with two unread lines, then its topic's colour with its intent written on it. */
function TraceCard({ card, trace }: TraceCardProps) {
  const color = colorOf(trace.topic);
  return (
    <g opacity={round(card.opacity)}>
      <TopicPilesScene.Pile
        rect={{ x: card.x, y: card.y, ...CARD }}
        sheets={1}
        color={sheetColor(color, card.colored)}
        lift={card.lift}
        label={
          <>
            {card.unread > 0 ? (
              <path
                d={unreadLines(card)}
                fill="none"
                strokeWidth={1.5}
                opacity={round(card.unread)}
                className="stroke-border-contrast"
              />
            ) : null}
            <IntentLines
              x={card.x}
              y={card.y}
              lines={trace.intent}
              written={card.written}
              color={color}
            />
          </>
        }
      />
    </g>
  );
}

function sheetColor(color: PileColor, colored: number): SheetColor {
  if (colored <= 0) return "neutral";
  return colored >= 1 ? color : { toward: color, by: colored };
}

// Two hairlines of text whose lengths differ from card to card.
function unreadLines({ index, x, y }: TraceCardFrame) {
  const first = 66 + ((index * 37) % 4) * 12;
  const second = 42 + ((index * 23) % 3) * 18;
  const left = x + TEXT_INSET;
  return `M${left} ${y + 28}h${first}M${left} ${y + 46}h${second}`;
}

/** A trace's intent on its top face, centred across its lines; only the first `written` characters show. */
function IntentLines({ x, y, lines, written, color }: IntentLinesProps) {
  const first = y + CARD.depth / 2 + 6 - ((lines.length - 1) * LINE_HEIGHT) / 2;
  return lines.map((line, index) => {
    const before = lines.slice(0, index).join("").length;
    return (
      <text
        key={index}
        x={x + TEXT_INSET}
        y={first + index * LINE_HEIGHT}
        fontSize={SMALL_FONT_SIZE}
        className={INK[color]}
      >
        {line.slice(0, Math.max(0, written - before))}
      </text>
    );
  });
}

/** A topic's name and count, written on its pile's top face. */
function TopicLabel({ x, topic }: TopicLabelProps) {
  return (
    <>
      <text
        x={x + TEXT_INSET}
        y={CARD.depth / 2 - 7}
        fontSize={SMALL_FONT_SIZE}
        className="fill-muted-foreground"
      >
        {topic.name}
      </text>
      <text
        x={x + TEXT_INSET}
        y={CARD.depth / 2 + 19}
        fontSize={MAIN_FONT_SIZE}
        className="fill-foreground"
      >
        {topic.count}
      </text>
    </>
  );
}

type TopicPilesLabelingProps = {
  /** The facet the traces are labeled by, written on the tab at the reading square. */
  facet: string;
  /** The topics the traces end up in, left to right. */
  topics: readonly { name: string; count: number }[];
  /** The traces in the order they are read; each is one sheet on its topic's pile. */
  traces: readonly LabeledTrace[];
};

type FacetTabProps = { text: string };

type TraceCardProps = { card: TraceCardFrame; trace: LabeledTrace };

type IntentLinesProps = {
  /** The card's back left corner on the floor. */
  x: number;
  y: number;
  lines: readonly string[];
  written: number;
  color: PileColor;
};

type TopicLabelProps = {
  /** The pile's left edge on the floor. */
  x: number;
  topic: TopicPilesLabelingProps["topics"][number];
};
