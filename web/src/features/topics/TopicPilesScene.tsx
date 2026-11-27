import { type ReactNode } from "react";
import { round } from "@/src/components/illustrations/engine/projection";
import { useIllustrationId } from "@/src/components/illustrations/engine/useIllustrationId";
import {
  GRID,
  PILE,
  PLANE,
  SHEET,
  raised,
  sheetStrengths,
  slabOutline,
  tint,
  type FloorRect,
  type PileColor,
} from "./topic-piles-geometry";

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

/** The svg the Topics drawings share: a box of css px on the floor, with the floor drawn under the children. */
function Scene({
  box,
  middle,
  drop,
  edges,
  edgeOpacity,
  children,
}: SceneProps) {
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
      <Floor id={id} view={view} edges={edges} edgeOpacity={edgeOpacity} />
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

/** The floor: a grid that fades toward the edges of the box, and darker lines that carry the drawing's edges across it. */
function Floor({ id, view, edges, edgeOpacity }: FloorProps) {
  const fade = { rx: view.width * 0.64, ry: view.height * 0.69 };
  const right = Math.max(...edges.xs) + RULE_REACH;
  const front = Math.max(...edges.ys) + GRID;
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
          {edges.ys.map((y, index) => (
            <path
              key={y}
              d={`M${-RULE_REACH} ${y}H${right}`}
              stroke={`url(#${id}-rule-x)`}
              opacity={edgeOpacity?.ys[index]}
            />
          ))}
          {edges.xs.map((x, index) => (
            <path
              key={x}
              d={`M${x} ${-RULE_REACH}V${front}`}
              stroke={`url(#${id}-rule-y)`}
              opacity={edgeOpacity?.xs[index]}
            />
          ))}
        </g>
      </g>
    </>
  );
}

/** A stack of coloured sheets, strongest at the bottom; `label` lies on its top face. */
function Pile({ x, sheets, color, label }: PileProps) {
  return (
    <Stack
      rect={{ x, y: 0, width: PILE.width, depth: PILE.depth }}
      corner={PILE_CORNER}
      strengths={sheetStrengths(sheets)}
      color={color}
      label={label}
    />
  );
}

/** Sheets stacked over `rect`, one per strength: dark outline on the silhouette only; `label` lies on the top face. */
function Stack({
  rect,
  base = 0,
  corner,
  strengths,
  color,
  colored = 1,
  label,
}: StackProps) {
  const clipId = useIllustrationId();
  const { x, y } = rect;
  const x1 = x + rect.width;
  const y1 = y + rect.depth;
  const top = base + strengths.length * SHEET.height;
  const outline = slabOutline(
    rect,
    strengths.length * SHEET.height,
    corner,
    base,
  );
  const seams = strengths
    .slice(1)
    .map((_, index) => {
      const z = base + (index + 1) * SHEET.height;
      return `M${raised(x, y, z)}L${raised(x, y1, z)}L${raised(x1, y1, z)}`;
    })
    .join("");
  return (
    <g>
      <clipPath id={clipId}>
        <path d={outline} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {strengths.map((strength, index) => {
          const z = base + index * SHEET.height;
          const z1 = z + SHEET.height;
          return (
            <g key={index}>
              <polygon
                points={`${raised(x, y, z1)} ${raised(x, y1, z1)} ${raised(x, y1, z)} ${raised(x, y, z)}`}
                style={{
                  fill: tint(color, strength / 2, "background", colored),
                }}
              />
              <polygon
                points={`${raised(x, y1, z1)} ${raised(x1, y1, z1)} ${raised(x1, y1, z)} ${raised(x, y1, z)}`}
                style={{ fill: tint(color, strength, "background", colored) }}
              />
            </g>
          );
        })}
        <path
          d={seams}
          fill="none"
          strokeWidth={1.5}
          className="stroke-background"
        />
        <path
          d={`M${raised(x, y1, top)}L${raised(x, y1, base)}`}
          fill="none"
          strokeWidth={1.5}
          className="stroke-border-contrast"
        />
        <g transform={`translate(0 ${round(-top)}) ${PLANE}`}>
          <rect
            x={x}
            y={y}
            width={rect.width}
            height={rect.depth}
            style={{ fill: tint(color, 16, "card", colored) }}
          />
          {label}
          <path
            d={`M${x} ${y}V${y1}H${x1}`}
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

type SceneProps = {
  /** Size on the page in css px. */
  box: { width: number; height: number };
  /** The drawing's middle on the floor, in screen units. */
  middle: { x: number; y: number };
  /** css px the drawing sits below the middle of the box. */
  drop: number;
  /** Floor positions of the drawing's edges; darker floor lines run along them. */
  edges: { xs: readonly number[]; ys: readonly number[] };
  /** How visible each of those lines is, 0 to 1, in the same order; all fully visible when left out. */
  edgeOpacity?: { xs: readonly number[]; ys: readonly number[] };
  children: ReactNode;
};

type FloorProps = Pick<SceneProps, "edges" | "edgeOpacity"> & {
  /** Prefix for this instance's ids. */
  id: string;
  view: ReturnType<typeof viewOf>;
};

type PileProps = {
  /** Left edge on the floor. */
  x: number;
  sheets: number;
  color: PileColor;
  /** What is written on the top face; null leaves it blank. */
  label: ReactNode;
};

type StackProps = Pick<PileProps, "color" | "label"> & {
  /** Footprint on the floor. */
  rect: FloorRect;
  /** How far the bottom sheet is off the floor. */
  base?: number;
  /** Radius of the silhouette's corners. */
  corner: number;
  /** Colour strength of each sheet, bottom first. */
  strengths: readonly number[];
  /** How much of its colour it shows: 0 is neutral grey, 1 the full colour. */
  colored?: number;
};

/** The floor the Topics drawings stand on; `TopicPilesScene.Pile` is a full-size stack of sheets, `TopicPilesScene.Stack` one of any size and place. */
const TopicPilesScene = Object.assign(Scene, { Pile, Stack });

export { TopicPilesScene };
