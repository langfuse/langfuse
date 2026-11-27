import { type ReactNode } from "react";
import {
  project,
  round,
  type Point,
} from "@/src/components/illustrations/engine/projection";
import { useIllustrationId } from "@/src/components/illustrations/engine/useIllustrationId";
import { GRID, PILE, PLANE, SHEET } from "./topic-piles-geometry";

// css px per floor unit.
const SCALE = 0.72;
const RULE_REACH = 300;
const PILE_CORNER = 4;

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

/** The svg the Topics pile drawings share: a box of css px on the floor, with the floor drawn under the children. */
function Scene({ box, middle, drop, pileCount, children }: SceneProps) {
  const id = useIllustrationId();
  const view = viewOf(box, middle, drop);
  return (
    <svg
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      width={box.width}
      height={box.height}
      aria-hidden="true"
      focusable="false"
      className="h-auto max-w-full shrink-0 font-mono font-normal"
    >
      <Floor id={id} view={view} pileCount={pileCount} />
      {children}
    </svg>
  );
}

/** The part of the floor a box shows: centred on `middle`, moved up by `drop` css px so the drawing sits low. */
function viewOf(
  box: SceneProps["box"],
  middle: SceneProps["middle"],
  drop: number,
) {
  const width = box.width / SCALE;
  const height = box.height / SCALE;
  return {
    x: round(middle.x - width / 2),
    y: round(middle.y - drop / SCALE - height / 2),
    width: round(width),
    height: round(height),
  };
}

/** The floor: a grid that fades toward the edges of the box, and darker lines that carry the piles' edges across it. */
function Floor({ id, view, pileCount }: FloorProps) {
  const fade = { rx: view.width * 0.64, ry: view.height * 0.69 };
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
        <mask id={`${id}-grid-fade`} maskUnits="userSpaceOnUse" {...view}>
          <rect
            x={view.x + view.width / 2 - fade.rx}
            y={view.y + view.height / 2 - fade.ry}
            width={2 * fade.rx}
            height={2 * fade.ry}
            fill={`url(#${id}-fade)`}
          />
        </mask>
        <linearGradient id={`${id}-edge-x`}>{EDGE_STOPS}</linearGradient>
        <linearGradient id={`${id}-edge-y`} x2={0} y2={1}>
          {EDGE_STOPS}
        </linearGradient>
        <mask id={`${id}-edges`} maskUnits="userSpaceOnUse" {...view}>
          <rect {...view} fill="white" />
          <rect {...view} fill={`url(#${id}-edge-x)`} />
          <rect {...view} fill={`url(#${id}-edge-y)`} />
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

/** A stack of sheets: dark outline on the silhouette only, hairlines inside; `label` lies on its top face. */
function Pile({ x, sheets, label }: PileProps) {
  const clipId = useIllustrationId();
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
          {label}
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
  const ratio = PILE_CORNER / Math.hypot(targetX - x, targetY - y);
  return [x + (targetX - x) * ratio, y + (targetY - y) * ratio];
}

type SceneProps = {
  /** Size on the page in css px. */
  box: { width: number; height: number };
  /** The drawing's middle on the floor, in screen units. */
  middle: { x: number; y: number };
  /** css px the drawing sits below the middle of the box. */
  drop: number;
  pileCount: number;
  children: ReactNode;
};

type FloorProps = Pick<SceneProps, "pileCount"> & {
  /** Prefix for this instance's ids. */
  id: string;
  view: ReturnType<typeof viewOf>;
};

type PileProps = {
  /** Left edge on the floor. */
  x: number;
  sheets: number;
  /** What is written on the top face; null leaves it blank. */
  label: ReactNode;
};

/** The floor the Topics pile drawings stand on; `TopicPilesScene.Pile` is one stack of sheets. */
const TopicPilesScene = Object.assign(Scene, { Pile });

export { TopicPilesScene };
