import { useEffect, useState, type ReactNode } from "react";
import {
  clamp01,
  round,
} from "@/src/components/illustrations/engine/projection";
import { useIllustrationId } from "@/src/components/illustrations/engine/useIllustrationId";
import {
  PILE_COLORS,
  PLANE,
  SHEET,
  ink,
  raised,
  slabOutline,
  tint,
  type PileColor,
} from "./topic-piles-geometry";
import { TopicPilesScene } from "./TopicPilesScene";

// The drawing's box in css px, centred between the list and the cards it turns into.
const BOX = { width: 720, height: 480 };
const MIDDLE = { x: 432, y: 54 };

// Floor units: a trace is a strip 6 squares wide and 1 deep; columns stand 7 squares apart; cards start 3 squares down.
const STRIP = { width: 216, depth: 36, pitch: 252, pad: 18 };
const CARD_TOP = 108;
const CORNER = 4;
const FONT = { text: 16.5, count: 19.5 };

// The list stands in the middle column and the first topic keeps it; the next two take the columns on either side.
const TOPIC_COLUMNS = [1, 0, 2];
const LIST_X = STRIP.pitch;

// Seconds into the loop; FINAL is the still shown before the loop starts and under reduced motion.
const LOOP = 10;
const FINAL = 7.2;
// Colour arrives three rows at a time, scattered over the list by a stride of 5 rows.
const TINT = { start: 0.6, stride: 5, perWave: 3, waveGap: 0.38, rowGap: 0.07 };
const TINT_FOR = 0.45;
const SLIDE = { start: 2.5, gap: 0.2 };
const SLIDE_FOR = 0.8;
const CLOSE = { start: 4.4, end: 5.2 };
const HEADER = { start: 5.15, end: 5.6 };
const JOIN = { start: 5.2, end: 5.6 };
const NAME = { start: 5.4, end: 5.7 };
const FADE_OUT = { start: 8.6, end: 9.4 };
const FADE_IN = { start: 8.9, end: 9.7 };

/** Decorative: a grey list of traces takes colour, splits into one column per topic and closes up into named cards. */
export function TopicTraceRegrouping({
  topics,
  traces,
}: TopicTraceRegroupingProps) {
  const id = useIllustrationId();
  const time = useLoopTime();
  const plan = planStrips(traces);
  const deepest = Math.max(
    ...topics.map(
      (_, topic) => plan.filter((strip) => strip.topic === topic).length,
    ),
  );
  return (
    <TopicPilesScene
      box={BOX}
      middle={MIDDLE}
      drop={0}
      edges={{
        xs: topics.flatMap((_, topic) => [
          columnX(topic),
          columnX(topic) + STRIP.width,
        ]),
        ys: [CARD_TOP, CARD_TOP + (deepest + 1) * STRIP.depth],
      }}
    >
      {momentsAt(time).map((moment) => (
        <g key={moment.key} opacity={round(moment.opacity)}>
          {cardsAt(plan, topics, moment.time).map((card) => (
            <Card
              key={card.key}
              clipId={`${id}-${moment.key}-${card.key}`}
              card={card}
            />
          ))}
        </g>
      ))}
    </TopicPilesScene>
  );
}

/** Seconds into the loop, once per animation frame; holds the final still on the server, at first paint and under reduced motion. */
function useLoopTime() {
  const [time, setTime] = useState(FINAL);
  useEffect(() => {
    if (!allowsMotion()) return;
    const origin = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      setTime((FINAL + Math.max(0, now - origin) / 1000) % LOOP);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return time;
}

/** What is on show at `time`: one moment of the build, or the finished cards fading out as the grey list fades in. */
function momentsAt(time: number) {
  if (time < FADE_OUT.start) return [{ key: "build", time, opacity: 1 }];
  return [
    { key: "cards", time: FADE_OUT.start, opacity: 1 - ease(time, FADE_OUT) },
    { key: "list", time: 0, opacity: ease(time, FADE_IN) },
  ].filter((moment) => moment.opacity > 0.005);
}

/** Each trace's place in the list and in its topic's card, and when it takes colour and slides out. */
function planStrips(traces: TopicTraceRegroupingProps["traces"]) {
  const leaving = traces
    .map(({ topic }, index) => ({ topic, index }))
    .filter(({ topic }) => columnX(topic) !== LIST_X)
    .sort((a, b) => a.topic - b.topic || a.index - b.index)
    .map(({ index }) => index);
  return traces.map((trace, index) => {
    const earlier = traces
      .slice(0, index)
      .filter(({ topic }) => topic === trace.topic).length;
    const rank = (index * TINT.stride) % traces.length;
    const turn = leaving.indexOf(index);
    return {
      ...trace,
      index,
      color: PILE_COLORS[trace.topic % PILE_COLORS.length] ?? "violet",
      listY: index * STRIP.depth,
      cardX: columnX(trace.topic),
      cardY: CARD_TOP + (earlier + 1) * STRIP.depth,
      tintAt:
        TINT.start +
        Math.floor(rank / TINT.perWave) * TINT.waveGap +
        (rank % TINT.perWave) * TINT.rowGap,
      slideAt: turn < 0 ? null : SLIDE.start + turn * SLIDE.gap,
    };
  });
}

/** The cards at `time`, back to front: strips that touch in one column make one card, and a closed-up card grows its header. */
function cardsAt(
  plan: ReturnType<typeof planStrips>,
  topics: TopicTraceRegroupingProps["topics"],
  time: number,
) {
  const closed = ease(time, CLOSE);
  const strips = plan
    .map((strip) => {
      const slid =
        strip.slideAt === null
          ? 0
          : ease(time, {
              start: strip.slideAt,
              end: strip.slideAt + SLIDE_FOR,
            });
      return {
        ...strip,
        x: LIST_X + (strip.cardX - LIST_X) * slid,
        y: strip.listY + (strip.cardY - strip.listY) * closed,
        amount: ease(time, {
          start: strip.tintAt,
          end: strip.tintAt + TINT_FOR,
        }),
      };
    })
    .sort((a, b) => a.x - b.x || a.y - b.y);

  const runs: (typeof strips)[] = [];
  for (const strip of strips) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    if (
      run &&
      last &&
      touches(last.x, strip.x) &&
      touches(last.y + STRIP.depth, strip.y)
    ) {
      run.push(strip);
    } else {
      runs.push([strip]);
    }
  }

  const grown = ease(time, HEADER);
  const named = ease(time, NAME);
  return runs
    .flatMap((run): CardShape[] => {
      const first = run[0];
      const last = run.at(-1);
      if (!first || !last) return [];
      const topic = topics[first.topic];
      const parts: CardPart[] = run.map((strip) => ({
        key: `${strip.index}`,
        y: strip.y,
        depth: STRIP.depth,
        color: strip.color,
        amount: strip.amount,
        strong: false,
        label: (
          <text
            x={round(strip.x + STRIP.pad)}
            y={baseline(strip.y, FONT.text)}
            fontSize={FONT.text}
            fillOpacity={0.8}
            style={{ fill: ink(strip.color, strip.amount) }}
          >
            {strip.text}
          </text>
        ),
      }));
      if (topic && grown > 0.001 && touches(first.y, CARD_TOP + STRIP.depth)) {
        parts.unshift({
          key: "header",
          y: first.y - STRIP.depth * grown,
          depth: STRIP.depth * grown,
          color: first.color,
          amount: 1,
          strong: true,
          label: (
            <g opacity={round(named)}>
              <text
                x={first.x + STRIP.pad}
                y={baseline(CARD_TOP, FONT.text)}
                fontSize={FONT.text}
                className="fill-muted-foreground"
              >
                {topic.name}
              </text>
              <text
                x={first.x + STRIP.width - STRIP.pad}
                y={baseline(CARD_TOP, FONT.count)}
                fontSize={FONT.count}
                textAnchor="end"
                className="fill-foreground"
              >
                {topic.count}
              </text>
            </g>
          ),
        });
      }
      return [
        {
          key: `${first.index}`,
          x: first.x,
          back: parts[0]?.y ?? first.y,
          front: last.y + STRIP.depth,
          frontTint: tint(last.color, 100, "background", last.amount),
          parts,
          separation: 1 - ease(time, JOIN),
        },
      ];
    })
    .sort((a, b) => a.back - b.back || b.x - a.x);
}

/** One raised card of parts that touch front to back: dark outline on the silhouette, hairlines inside; `separation` darkens the lines between parts. */
function Card({ clipId, card }: CardProps) {
  const { x, back: y0, front: y1, parts, separation } = card;
  const lift = SHEET.height;
  const x1 = x + STRIP.width;
  const outline = slabOutline(
    { x, y: y0, width: STRIP.width, depth: y1 - y0 },
    lift,
    CORNER,
  );
  const joints = parts.slice(1).map((part) => part.y);
  const dividers = joints.map((y) => `M${round(x)} ${round(y)}H${round(x1)}`);
  const ticks = joints.map((y) => `M${raised(x, y, lift)}L${raised(x, y)}`);
  const isSeparate = separation > 0.005;
  return (
    <g>
      <clipPath id={clipId}>
        <path d={outline} />
      </clipPath>
      <g clipPath={`url(#${clipId})`} fill="none" strokeWidth={1.5}>
        {parts.map((part) => (
          <polygon
            key={part.key}
            points={`${raised(x, part.y, lift)} ${raised(x, part.y + part.depth, lift)} ${raised(x, part.y + part.depth)} ${raised(x, part.y)}`}
            style={{ fill: tint(part.color, 50, "background", part.amount) }}
          />
        ))}
        <polygon
          points={`${raised(x, y1, lift)} ${raised(x1, y1, lift)} ${raised(x1, y1)} ${raised(x, y1)}`}
          style={{ fill: card.frontTint }}
        />
        {isSeparate ? (
          <path
            d={ticks.join("")}
            strokeOpacity={round(separation)}
            className="stroke-foreground"
          />
        ) : null}
        <path
          d={`M${raised(x, y1, lift)}L${raised(x, y1)}`}
          className="stroke-border-contrast"
        />
        <g transform={`translate(0 ${-lift}) ${PLANE}`}>
          {parts.map((part) => (
            <g key={part.key} stroke="none">
              <rect
                x={round(x)}
                y={round(part.y)}
                width={STRIP.width}
                height={round(part.depth)}
                style={{
                  fill: tint(
                    part.color,
                    part.strong ? 34 : 16,
                    "card",
                    part.amount,
                  ),
                }}
              />
              {part.label}
            </g>
          ))}
          <path d={dividers.join("")} className="stroke-border-contrast" />
          {isSeparate ? (
            <path
              d={dividers.join("")}
              strokeOpacity={round(separation)}
              className="stroke-foreground"
            />
          ) : null}
          <path
            d={`M${round(x)} ${round(y0)}V${round(y1)}H${round(x1)}`}
            className="stroke-border-contrast"
          />
        </g>
      </g>
      <path
        d={outline}
        fill="none"
        strokeWidth={1.5}
        className="stroke-foreground"
      />
    </g>
  );
}

/** False under reduced motion, and where the preference cannot be read. */
function allowsMotion() {
  return (
    typeof matchMedia !== "undefined" &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Left edge of a topic's column on the floor. */
function columnX(topic: number) {
  return (TOPIC_COLUMNS[topic] ?? topic) * STRIP.pitch;
}

/** Where text of `fontSize` sits to look centred in a strip whose back edge is at `y`. */
function baseline(y: number, fontSize: number) {
  return round(y + STRIP.depth / 2 + fontSize * 0.34);
}

function touches(a: number, b: number) {
  return Math.abs(a - b) < 0.01;
}

/** 0 to 1 while `time` runs through `span`: slow, fast, slow. */
function ease(time: number, span: { start: number; end: number }) {
  const progress = clamp01((time - span.start) / (span.end - span.start));
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (2 - 2 * progress) ** 3 / 2;
}

type TopicTraceRegroupingProps = {
  /** Three topics; the first keeps the middle column. */
  topics: readonly { name: string; count: number }[];
  /** The list, in the order the traces came in; `topic` is an index into `topics`. */
  traces: readonly { topic: number; text: string }[];
};

type CardPart = {
  key: string;
  /** Back edge and depth on the floor. */
  y: number;
  depth: number;
  color: PileColor;
  /** 0 is grey, 1 is the topic's full colour. */
  amount: number;
  /** A header: its top face is tinted stronger. */
  strong: boolean;
  /** What is written on the top face. */
  label: ReactNode;
};

type CardShape = {
  key: string;
  /** Left, back and front edges on the floor. */
  x: number;
  back: number;
  front: number;
  /** Colour of the front wall: the nearest part's. */
  frontTint: string;
  parts: CardPart[];
  /** 0 to 1: how much the lines between parts read as separate outlines. */
  separation: number;
};

type CardProps = {
  /** Unique id for the card's clip path. */
  clipId: string;
  card: CardShape;
};
