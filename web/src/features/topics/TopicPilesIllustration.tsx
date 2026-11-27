import {
  planTransform,
  project,
  round,
  textWidth,
  type Point,
} from "@/src/components/illustrations/engine/projection";
import { useIllustrationId } from "@/src/components/illustrations/engine/useIllustrationId";
import styles from "./TopicPilesIllustration.module.css";

// Floor units on a 36 grid; one unit is 0.6 css px at full width.
const GRID = 36;
const VIEW = { x: -95, y: -220, width: 800, height: 517 };
const CENTER = { x: VIEW.x + VIEW.width / 2, y: VIEW.y + VIEW.height / 2 };
const FLOOR_FADE = { rx: 460, ry: 340 };
const PILE = { width: 144, depth: 108, pitch: 180, corner: 4 };
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
  const traces = slips.map((slip, index) => {
    const x = index * PILE.pitch;
    // Each row sits two squares nearer than the next one; nearer rows are fainter.
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
  return (
    <svg
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
      aria-hidden="true"
      focusable="false"
      className="h-auto w-120 max-w-full shrink-0 font-mono font-normal"
    >
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
        <linearGradient id={`${id}-edge-x`}>{EDGE_STOPS}</linearGradient>
        <linearGradient id={`${id}-edge-y`} x2={0} y2={1}>
          {EDGE_STOPS}
        </linearGradient>
        <mask id={`${id}-floor`} maskUnits="userSpaceOnUse" {...VIEW}>
          <rect
            x={CENTER.x - FLOOR_FADE.rx}
            y={CENTER.y - FLOOR_FADE.ry}
            width={2 * FLOOR_FADE.rx}
            height={2 * FLOOR_FADE.ry}
            fill={`url(#${id}-fade)`}
          />
          <rect {...VIEW} fill={`url(#${id}-edge-x)`} />
          <rect {...VIEW} fill={`url(#${id}-edge-y)`} />
        </mask>
        {traces.map((trace) => (
          <linearGradient
            key={trace.text}
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
            <stop
              offset={0.85}
              stopColor="currentColor"
              className={TONE[trace.tone].wire}
            />
          </linearGradient>
        ))}
      </defs>

      <g mask={`url(#${id}-floor)`}>
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

      <g transform={PLANE}>
        {traces.map((trace) => (
          <g key={trace.text}>
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
                  ROW.padLeft +
                  textWidth(trace.text, ROW.fontSize) +
                  ROW.padRight
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
          </g>
        ))}
        {traces.map((trace) => (
          <rect
            key={trace.text}
            x={trace.wireX - NODE / 2}
            y={trace.y - NODE / 2}
            width={NODE}
            height={NODE}
            className={TONE[trace.tone].node}
          />
        ))}
        {traces.map((trace, index) => (
          <TracePulse
            key={trace.text}
            d={`M${trace.wireX} ${trace.y}V${PILE.depth}`}
            delay={index * 0.7}
          />
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

/** A dot travelling along a wire from the example trace to its pile. */
function TracePulse({ d, delay }: TracePulseProps) {
  return (
    <path
      d={d}
      pathLength={100}
      fill="none"
      strokeWidth={5}
      strokeLinecap="round"
      className={`stroke-foreground-tertiary ${styles.pulse}`}
      style={{ animationDelay: `${delay}s` }}
    />
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

type PileProps = {
  pile: TopicPilesIllustrationProps["piles"][number];
  /** Left edge on the floor. */
  x: number;
  clipId: string;
};

type TracePulseProps = {
  /** The wire's path, from the trace to the pile. */
  d: string;
  /** Seconds before the first run. */
  delay: number;
};
