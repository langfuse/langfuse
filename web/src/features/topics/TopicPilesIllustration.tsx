import {
  planTransform,
  project,
  round,
  textWidth,
  type Point,
} from "@/src/components/illustrations/engine/projection";
import { useIllustrationId } from "@/src/components/illustrations/engine/useIllustrationId";

// Floor units on a 36 grid, drawn at SCALE css px each in a BOX of css px.
const GRID = 36;
const SCALE = 0.72;
const BOX = { width: 720, height: 480 };
// The box in floor units around the drawing's middle (339, 20); the drawing sits 30 css px low.
const VIEW = {
  x: round(339 - BOX.width / SCALE / 2),
  y: round(20 - 30 / SCALE - BOX.height / SCALE / 2),
  width: round(BOX.width / SCALE),
  height: round(BOX.height / SCALE),
};
const CENTER = { x: VIEW.x + VIEW.width / 2, y: VIEW.y + VIEW.height / 2 };
const FLOOR_FADE = { rx: 640, ry: 460 };
const RULE_REACH = 300;
const PILE = { width: 180, depth: 108, pitch: 216, corner: 4 };
const SHEET = { height: 8, traces: 24 };
const ROW = { height: 36, padLeft: 17, padRight: 14, fontSize: 19.5 };
const NAME_FONT_SIZE = 16.5;
const WIRE_TONE_LENGTH = 54;
const NODE = 6;
const PLANE = planTransform();

const TONE = {
  error: { node: "fill-destructive", wire: "text-destructive" },
  ok: { node: "fill-accent-dark-green", wire: "text-accent-dark-green" },
} as const;

// A floor line is full strength in its middle third and fades out at both ends.
const RULE_STOPS = [
  { offset: 0, opacity: 0 },
  { offset: 0.35, opacity: 1 },
  { offset: 0.65, opacity: 1 },
  { offset: 1, opacity: 0 },
].map(({ offset, opacity }) => (
  <stop
    key={offset}
    offset={offset}
    stopColor="currentColor"
    stopOpacity={opacity}
    className="text-border-contrast"
  />
));

// Black fades the floor out over the outer 8% of the box on each side.
const EDGE_STOPS = [
  { offset: 0, opacity: 1 },
  { offset: 0.08, opacity: 0 },
  { offset: 0.92, opacity: 0 },
  { offset: 1, opacity: 1 },
].map(({ offset, opacity }) => (
  <stop key={offset} offset={offset} stopColor="black" stopOpacity={opacity} />
));

/** Decorative: each topic is a pile of traces as tall as its count, with one example trace wired to it. */
export function TopicPilesIllustration({
  piles,
  slips,
}: TopicPilesIllustrationProps) {
  const id = useIllustrationId();
  return (
    <svg
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
      width={BOX.width}
      height={BOX.height}
      aria-hidden="true"
      focusable="false"
      className="h-auto max-w-full shrink-0 font-mono font-normal"
    >
      <Floor id={id} pileCount={piles.length} />
      <g transform={PLANE}>
        {layoutTraces(slips, id).map((trace) => (
          <ExampleTrace key={trace.text} trace={trace} />
        ))}
      </g>
      {piles
        .map((pile, index) => (
          <Pile
            key={pile.name}
            pile={pile}
            x={index * PILE.pitch}
            clipId={`${id}-pile-${index}`}
          />
        ))
        .reverse()}
    </svg>
  );
}

/** Each example trace sits in front of its pile, two squares nearer than the next one; nearer ones are fainter. */
function layoutTraces(slips: TopicPilesIllustrationProps["slips"], id: string) {
  return slips.map((slip, index) => {
    const x = index * PILE.pitch;
    const nearer = slips.length - 1 - index;
    return {
      ...slip,
      x,
      wireX: x + GRID,
      y: PILE.depth + GRID + nearer * 2 * GRID,
      opacity: 1 - nearer * 0.2,
      gradientId: `${id}-wire-${index}`,
    };
  });
}

/** The floor: a grid that fades toward the edges of the box, and darker lines that carry the piles' edges across it. */
function Floor({ id, pileCount }: FloorProps) {
  const right = (pileCount - 1) * PILE.pitch + PILE.width + RULE_REACH;
  const front = PILE.depth + GRID;
  const pileEdges = Array.from({ length: pileCount }, (_, index) => [
    index * PILE.pitch,
    index * PILE.pitch + PILE.width,
  ]).flat();
  return (
    <>
      <defs>
        <pattern
          id={`${id}-grid`}
          width={GRID}
          height={GRID}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M${GRID} 0H0V${GRID}`}
            fill="none"
            className="stroke-border-contrast"
          />
        </pattern>
        <radialGradient id={`${id}-fade`}>
          <stop offset={0.66} stopColor="white" stopOpacity={0.5} />
          <stop offset={1} stopColor="white" stopOpacity={0} />
        </radialGradient>
        <mask id={`${id}-grid-fade`} maskUnits="userSpaceOnUse" {...VIEW}>
          <rect
            x={CENTER.x - FLOOR_FADE.rx}
            y={CENTER.y - FLOOR_FADE.ry}
            width={2 * FLOOR_FADE.rx}
            height={2 * FLOOR_FADE.ry}
            fill={`url(#${id}-fade)`}
          />
        </mask>
        <linearGradient id={`${id}-edge-x`}>{EDGE_STOPS}</linearGradient>
        <linearGradient id={`${id}-edge-y`} x2={0} y2={1}>
          {EDGE_STOPS}
        </linearGradient>
        <mask id={`${id}-edges`} maskUnits="userSpaceOnUse" {...VIEW}>
          <rect {...VIEW} fill="white" />
          <rect {...VIEW} fill={`url(#${id}-edge-x)`} />
          <rect {...VIEW} fill={`url(#${id}-edge-y)`} />
        </mask>
        <linearGradient
          id={`${id}-rule-x`}
          gradientUnits="userSpaceOnUse"
          x1={-RULE_REACH}
          x2={right}
        >
          {RULE_STOPS}
        </linearGradient>
        <linearGradient
          id={`${id}-rule-y`}
          gradientUnits="userSpaceOnUse"
          x2={0}
          y1={-RULE_REACH}
          y2={front}
        >
          {RULE_STOPS}
        </linearGradient>
      </defs>
      <g mask={`url(#${id}-edges)`}>
        <g mask={`url(#${id}-grid-fade)`}>
          <g transform={PLANE}>
            <rect
              x={-1500}
              y={-1500}
              width={3200}
              height={3200}
              fill={`url(#${id}-grid)`}
            />
          </g>
        </g>
        <g transform={PLANE} fill="none" strokeWidth={1.5}>
          <path
            d={[0, PILE.depth]
              .map((y) => `M${-RULE_REACH} ${y}H${right}`)
              .join("")}
            stroke={`url(#${id}-rule-x)`}
          />
          <path
            d={pileEdges.map((x) => `M${x} ${-RULE_REACH}V${front}`).join("")}
            stroke={`url(#${id}-rule-y)`}
          />
        </g>
      </g>
    </>
  );
}

/** One example trace: an outlined row, its wire to the pile and the square where they meet. */
function ExampleTrace({ trace }: ExampleTraceProps) {
  const tone = TONE[trace.tone];
  return (
    <g>
      <linearGradient
        id={trace.gradientId}
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
        stroke={`url(#${trace.gradientId})`}
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

/** A stack of sheets: dark outline on the silhouette only, hairlines inside. */
function Pile({ pile, x, clipId }: PileProps) {
  const sheets = Math.max(1, Math.round(pile.count / SHEET.traces));
  const lift = sheets * SHEET.height;
  const x1 = x + PILE.width;
  const y1 = PILE.depth;
  const backLeft = lifted(x, 0, lift);
  const backRight = lifted(x1, 0, lift);
  const frontRight = lifted(x1, y1, lift);
  const frontRightFoot = lifted(x1, y1);
  const frontLeftFoot = lifted(x, y1);
  const backLeftFoot = lifted(x, 0);
  const frontLeft = lifted(x, y1, lift);
  const outline = [
    `M${corner(backLeftFoot, backLeft, backRight)}`,
    `L${corner(backLeft, backRight, frontRight)}`,
    `L${corner(backRight, frontRight, frontRightFoot)}`,
    `L${corner(frontRight, frontRightFoot, frontLeftFoot)}`,
    `L${corner(frontRightFoot, frontLeftFoot, backLeftFoot)}`,
    `L${corner(frontLeftFoot, backLeftFoot, backLeft)}Z`,
  ].join("");
  const seams = Array.from({ length: sheets - 1 }, (_, index) => {
    const z = (index + 1) * SHEET.height;
    return `M${at(lifted(x, 0, z))}L${at(lifted(x, y1, z))}L${at(lifted(x1, y1, z))}`;
  }).join("");
  return (
    <g>
      <clipPath id={clipId}>
        <path d={outline} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <polygon
          points={[backLeft, frontLeft, frontLeftFoot, backLeftFoot]
            .map(at)
            .join(" ")}
          className="fill-background"
        />
        <polygon
          points={[frontLeft, frontRight, frontRightFoot, frontLeftFoot]
            .map(at)
            .join(" ")}
          className="fill-muted"
        />
        <path d={seams} fill="none" className="stroke-border-contrast" />
        <path
          d={`M${at(frontLeft)}L${at(frontLeftFoot)}`}
          fill="none"
          strokeWidth={1.5}
          className="stroke-border-contrast"
        />
        <g transform={`translate(0 ${-lift}) ${PLANE}`}>
          <rect
            x={x}
            y={0}
            width={PILE.width}
            height={PILE.depth}
            className="fill-card"
          />
          <text
            x={x + GRID / 2}
            y={y1 / 2 - 7}
            fontSize={NAME_FONT_SIZE}
            className="fill-muted-foreground"
          >
            {pile.name}
          </text>
          <text
            x={x + GRID / 2}
            y={y1 / 2 + 19}
            fontSize={ROW.fontSize}
            className="fill-foreground"
          >
            {pile.count}
          </text>
          <path
            d={`M${x} 0V${y1}H${x1}`}
            fill="none"
            strokeWidth={1.5}
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

/** Screen position of a floor point raised by `z`. */
function lifted(x: number, y: number, z = 0): Point {
  const [screenX, screenY] = project([x, y]);
  return [screenX, screenY - z];
}

function at([x, y]: Point) {
  return `${round(x)} ${round(y)}`;
}

/** The rounded turn at `point` on the way from `from` to `to`. */
function corner(from: Point, point: Point, to: Point) {
  return `${at(toward(point, from))}Q${at(point)} ${at(toward(point, to))}`;
}

function toward([x, y]: Point, [targetX, targetY]: Point): Point {
  const ratio = PILE.corner / Math.hypot(targetX - x, targetY - y);
  return [x + (targetX - x) * ratio, y + (targetY - y) * ratio];
}

type TopicPilesIllustrationProps = {
  /** Three topics, left to right; each pile is as tall as its count. */
  piles: readonly { name: string; count: number }[];
  /** One example trace per pile, in the same order. */
  slips: readonly { text: string; tone: keyof typeof TONE }[];
};

type FloorProps = {
  /** Prefix for this instance's ids. */
  id: string;
  pileCount: number;
};

type ExampleTraceProps = { trace: ReturnType<typeof layoutTraces>[number] };

type PileProps = {
  pile: TopicPilesIllustrationProps["piles"][number];
  /** Left edge on the floor. */
  x: number;
  clipId: string;
};
