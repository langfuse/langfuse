import {
  round,
  textWidth,
} from "@/src/components/illustrations/engine/projection";
import { useIllustrationId } from "@/src/components/illustrations/engine/useIllustrationId";
import { GRID, PILE, PLANE, SHEET } from "./topic-piles-geometry";
import { TopicPilesScene } from "./TopicPilesScene";

// The drawing's box in css px; the drawing sits DROP css px below its middle.
const BOX = { width: 720, height: 480 };
const MIDDLE = { x: 339, y: 20 };
const DROP = 50;
const ROW = { height: 36, padLeft: 17, padRight: 14, fontSize: 19.5 };
const NAME_FONT_SIZE = 16.5;
const WIRE_TONE_LENGTH = 54;
const NODE = 6;

const TONE = {
  error: { node: "fill-destructive", wire: "text-destructive" },
  ok: { node: "fill-accent-dark-green", wire: "text-accent-dark-green" },
} as const;

/** Decorative: each topic is a pile of traces as tall as its count, with one example trace wired to it. */
export function TopicPilesIllustration({
  piles,
  slips,
}: TopicPilesIllustrationProps) {
  return (
    <TopicPilesScene
      box={BOX}
      middle={MIDDLE}
      drop={DROP}
      pileCount={piles.length}
    >
      <g transform={PLANE}>
        {layoutTraces(slips).map((trace) => (
          <ExampleTrace key={trace.text} trace={trace} />
        ))}
      </g>
      {piles
        .map((pile, index) => (
          <TopicPilesScene.Pile
            key={pile.name}
            x={index * PILE.pitch}
            sheets={Math.max(1, Math.round(pile.count / SHEET.traces))}
            label={<PileLabel x={index * PILE.pitch} pile={pile} />}
          />
        ))
        .reverse()}
    </TopicPilesScene>
  );
}

/** Each example trace sits in front of its pile, two squares nearer than the next one; nearer ones are fainter. */
function layoutTraces(slips: TopicPilesIllustrationProps["slips"]) {
  return slips.map((slip, index) => {
    const x = index * PILE.pitch;
    const nearer = slips.length - 1 - index;
    return {
      ...slip,
      x,
      wireX: x + GRID,
      y: PILE.depth + GRID + nearer * 2 * GRID,
      opacity: 1 - nearer * 0.2,
    };
  });
}

/** One example trace: an outlined row, its wire to the pile and the square where they meet. */
function ExampleTrace({ trace }: ExampleTraceProps) {
  const gradientId = useIllustrationId();
  const tone = TONE[trace.tone];
  return (
    <g>
      <linearGradient
        id={gradientId}
        gradientUnits="userSpaceOnUse"
        x1={0}
        y1={trace.y - WIRE_TONE_LENGTH}
        x2={0}
        y2={trace.y}
      >
        <stop
          offset={0}
          stopColor="currentColor"
          className="text-border-contrast"
        />
        <stop offset={0.85} stopColor="currentColor" className={tone.wire} />
      </linearGradient>
      <path
        d={`M${trace.wireX} ${PILE.depth}V${trace.y}`}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={1.5}
      />
      <g opacity={trace.opacity}>
        <rect
          x={trace.x}
          y={trace.y}
          width={
            ROW.padLeft + textWidth(trace.text, ROW.fontSize) + ROW.padRight
          }
          height={ROW.height}
          rx={1}
          className="fill-background/60 stroke-border-contrast"
        />
        <text
          x={trace.x + ROW.padLeft}
          y={round(trace.y + ROW.height / 2 + ROW.fontSize * 0.34)}
          fontSize={ROW.fontSize}
          className="fill-foreground-tertiary"
        >
          {trace.text}
        </text>
      </g>
      <rect
        x={trace.wireX - NODE / 2}
        y={trace.y - NODE / 2}
        width={NODE}
        height={NODE}
        className={tone.node}
      />
    </g>
  );
}

/** A topic's name and count, written on its pile's top face. */
function PileLabel({ x, pile }: PileLabelProps) {
  return (
    <>
      <text
        x={x + GRID / 2}
        y={PILE.depth / 2 - 7}
        fontSize={NAME_FONT_SIZE}
        className="fill-muted-foreground"
      >
        {pile.name}
      </text>
      <text
        x={x + GRID / 2}
        y={PILE.depth / 2 + 19}
        fontSize={ROW.fontSize}
        className="fill-foreground"
      >
        {pile.count}
      </text>
    </>
  );
}

type TopicPilesIllustrationProps = {
  /** Three topics, left to right; each pile is as tall as its count. */
  piles: readonly { name: string; count: number }[];
  /** One example trace per pile, in the same order. */
  slips: readonly { text: string; tone: keyof typeof TONE }[];
};

type ExampleTraceProps = { trace: ReturnType<typeof layoutTraces>[number] };

type PileLabelProps = {
  /** The pile's left edge on the floor. */
  x: number;
  pile: TopicPilesIllustrationProps["piles"][number];
};
