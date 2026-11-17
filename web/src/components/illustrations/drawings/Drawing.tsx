"use client";

import type { CSSProperties, ReactNode } from "react";
import { Block } from "../engine/Block";
import { Chip } from "../engine/Chip";
import { Frame, type Accent, type Backdrop, type Lift } from "../engine/Frame";
import { planTransform, PROJECTION, round } from "../engine/projection";
import scene from "../engine/Scene.module.css";
import { identifier } from "../engine/slots";
import { useIllustrationId } from "../engine/useIllustrationId";
import { usePlayback, type PlayTrigger } from "../engine/usePlayback";
import {
  DESIGNS,
  type DrawingName,
  type FloorShape,
  type Shape,
} from "./designs";
import styles from "./Drawing.module.css";
import {
  CHIP_PAD_X,
  DOT_RADIUS,
  ENTRANCE_GAP,
  layoutDrawing,
  TEXT_SIZE,
  type HeroGroup,
  type Part,
  type PlanGroup,
} from "./layout";

/** What each motion preset does: when the entrance plays, when the idle loop runs, when the hero lifts. */
const MOTION = {
  /** Builds once when it scrolls into view; moves only while hovered. */
  subtle: { entrance: "inView", idle: "hover", lift: "hover" },
  /** Still until hovered; each hover rebuilds it. */
  hover: { entrance: "hover", idle: "hover", lift: "hover" },
  off: { entrance: "off", idle: "off", lift: "off" },
} as const satisfies Record<
  string,
  { entrance: PlayTrigger; idle: "hover" | "off"; lift: Lift }
>;

export type DrawingMotion = keyof typeof MOTION;

type DrawingProps = {
  drawing: DrawingName;
  motion: DrawingMotion;
  backdrop: Backdrop;
  accent: Accent;
};

/** play while the entrance runs; pending (hidden) only where an observer is about to start it, so it never blinks. */
function entranceState(
  entrance: PlayTrigger,
  runs: number,
  startsHidden: boolean,
) {
  if (entrance === "off") return undefined;
  if (runs > 0) return "play";
  return startsHidden ? "pending" : undefined;
}

function pathClass(shape: Extract<Shape, { kind: "path" }>) {
  if (shape.guide) return scene.guide;
  if (shape.dashed) return `${styles.pending} ${styles.march}`;
  return shape.ink ? styles.data : scene.wire;
}

function CardShape({ shape }: { shape: Extract<Shape, { kind: "card" }> }) {
  return (
    <rect
      className={
        shape.dashed ? `${styles.placeholder} ${styles.march}` : scene.card
      }
      {...shape.rect}
    />
  );
}

function BarShape({ shape }: { shape: Extract<Shape, { kind: "bar" }> }) {
  const radius = Math.min(shape.rect.width, shape.rect.height) / 2;
  return (
    <rect
      className={styles.bar}
      data-tone={shape.tone}
      {...shape.rect}
      rx={radius}
    />
  );
}

function DotShape({ shape }: { shape: Extract<Shape, { kind: "dot" }> }) {
  const r = shape.r ?? DOT_RADIUS;
  const [cx, cy] = shape.at;
  const tone = shape.tone ?? "neutral";
  if (shape.hollow)
    return (
      <circle
        className={`${styles.hollow} ${styles.march}`}
        data-tone={tone}
        cx={cx}
        cy={cy}
        r={r}
      />
    );
  return (
    <g data-tone={tone}>
      {shape.pulse && (
        <circle
          className={`${styles.ring} ${styles.pulse}`}
          cx={cx}
          cy={cy}
          r={r}
        />
      )}
      <circle
        className={`${scene.toned} ${scene.halo}`}
        cx={cx}
        cy={cy}
        r={r * 1.7}
      />
      <circle className={scene.toned} cx={cx} cy={cy} r={r} />
    </g>
  );
}

function ChipShape({ shape }: { shape: Extract<Shape, { kind: "chip" }> }) {
  return (
    <Chip
      x={shape.at[0]}
      y={shape.at[1]}
      slot={identifier(shape.text, 14)}
      variant={shape.soft ? "soft" : "solid"}
      fontSize={shape.size ?? TEXT_SIZE}
      padX={CHIP_PAD_X}
    />
  );
}

function TextShape({ shape }: { shape: Extract<Shape, { kind: "text" }> }) {
  const tone = shape.tone ?? "label";
  return (
    <text
      className={scene[tone]}
      data-tone={tone}
      x={shape.at[0]}
      y={shape.at[1]}
      style={{ fontSize: shape.size ?? TEXT_SIZE }}
    >
      {shape.text}
    </text>
  );
}

/** Solid lines draw in along their length (pathLength 1); guides and data still to come are dashed. */
function PathShape({ shape }: { shape: Extract<Shape, { kind: "path" }> }) {
  const d = shape.points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`)
    .join("");
  const isDashed = shape.guide === true || shape.dashed === true;
  return (
    <path
      className={pathClass(shape)}
      data-tone={shape.tone}
      d={d}
      pathLength={isDashed ? undefined : 1}
    />
  );
}

function RingShape({ shape }: { shape: Extract<Shape, { kind: "ring" }> }) {
  return (
    <circle
      className={
        shape.dashed ? `${styles.placeholder} ${styles.march}` : scene.card
      }
      cx={shape.at[0]}
      cy={shape.at[1]}
      r={shape.r}
    />
  );
}

const SHAPE_VIEWS: {
  [K in FloorShape["kind"]]: (props: {
    shape: Extract<Shape, { kind: K }>;
  }) => ReactNode;
} = {
  card: CardShape,
  bar: BarShape,
  dot: DotShape,
  chip: ChipShape,
  text: TextShape,
  path: PathShape,
  ring: RingShape,
};

function ShapeView({ shape }: { shape: FloorShape }) {
  const View = SHAPE_VIEWS[shape.kind] as (props: {
    shape: FloorShape;
  }) => ReactNode;
  return <View shape={shape} />;
}

/** A part in its entrance group, with what enters along with it. */
function Entering({ part, children }: { part: Part; children?: ReactNode }) {
  const { cue } = part;
  const timing = {
    "--ripple": Math.round(cue.ripple),
    "--from-x": `${round(cue.from[0])}px`,
    "--from-y": `${round(cue.from[1])}px`,
  } as CSSProperties;
  return (
    <g className={styles[cue.entrance]} style={timing}>
      <ShapeView shape={part.shape} />
      {children}
    </g>
  );
}

function PlanSegment({ segment }: { segment: PlanGroup }) {
  return (
    <g transform={planTransform(PROJECTION)}>
      {segment.pieces.map((piece, index) => (
        <Entering key={index} part={piece}>
          {piece.contents.map((part, k) => (
            <Entering key={k} part={part} />
          ))}
        </Entering>
      ))}
    </g>
  );
}

/** The hero breaks out of the plan group, since its sides are drawn in screen space; its face fills in as it settles. */
function HeroSegment({
  sceneId,
  segment,
  isLanding,
}: {
  sceneId: string;
  segment: HeroGroup;
  isLanding: boolean;
}) {
  const { rect, depth, isPlate, face } = segment;
  return (
    <g className={styles.land}>
      <Block
        sceneId={sceneId}
        projection={PROJECTION}
        runs={0}
        face={rect}
        depth={depth}
        isHero
        isAccented={!isPlate}
        isLanding={isLanding}
      >
        <g
          className={isPlate ? undefined : styles.accentedFace}
          transform={`translate(${rect.x} ${rect.y})`}
        >
          {face.map((part, index) => (
            <Entering key={index} part={part} />
          ))}
        </g>
      </Block>
    </g>
  );
}

/** One empty-state drawing on its floor, filling its parent's height. Decorative: the text beside it carries the meaning. */
export function Drawing({ drawing, motion, backdrop, accent }: DrawingProps) {
  const id = useIllustrationId();
  const { entrance, idle, lift } = MOTION[motion];
  const playback = usePlayback(entrance, ENTRANCE_GAP);
  const layout = layoutDrawing(DESIGNS[drawing]);
  const entranceNow = entranceState(
    entrance,
    playback.runs,
    playback.startsHidden,
  );

  return (
    <span
      className={styles.frame}
      data-idle={idle}
      data-entrance={entranceNow}
      data-host-active={playback.isHostActive ? "" : undefined}
    >
      <Frame
        id={id}
        label={null}
        viewBox={layout.viewBox}
        floor={layout.floor}
        backdrop={backdrop}
        projection={PROJECTION}
        fit="height"
        accent={accent}
        lift={lift}
        playback={{ ...playback, runs: 0, startsHidden: false }}
        plate={null}
      >
        <g
          key={playback.runs}
          transform={`translate(${layout.offset[0]} ${layout.offset[1]})`}
        >
          {layout.segments.map((segment, index) =>
            segment.kind === "hero" ? (
              <HeroSegment
                key={index}
                sceneId={id}
                segment={segment}
                isLanding={entranceNow === "play"}
              />
            ) : (
              <PlanSegment key={index} segment={segment} />
            ),
          )}
        </g>
      </Frame>
    </span>
  );
}
