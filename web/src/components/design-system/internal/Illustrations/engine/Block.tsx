import type { CSSProperties, ReactNode } from "react";
import { at } from "./motion";
import {
  corners,
  planTransform,
  project,
  round,
  type Point,
  type Projection,
  type Rect,
} from "./projection";
import styles from "./Scene.module.css";

type BlockProps = {
  /** The scene's id, for its shadow blur. */
  sceneId: string;
  projection: Projection;
  /** The scene's run count; each run replays the press. */
  runs: number;
  /** The top face, in plan units. */
  face: Rect;
  /** Screen px the top face stands off the floor. */
  depth?: number;
  /** The illustration's focus: lifts on hover and, unless `isAccented` is false, takes the highlight accent. */
  isHero?: boolean;
  /** Paints the top face in the highlight accent; off for large plates where it would flood the scene. */
  isAccented?: boolean;
  /** When, in ms into a run, the block presses down and springs back. */
  pressAt?: number;
  /** When, in ms, it lands in a first build from a hidden frame; to stagger several blocks. */
  landAt?: number;
  /** Casts the soft shadow on the floor under it. */
  hasShadow?: boolean;
  /** Drawn on the top face, in plan units. */
  children?: ReactNode;
};

const skewOf = ([x, y]: Point) => round((Math.atan2(y, x) * 180) / Math.PI);

/** A side face drawn as a 1-unit strip, stretched down to the floor so it follows the top face as it lifts. */
const sideTransform = (
  origin: Point,
  skew: number,
  depth: number,
): CSSProperties => ({
  transform: `translate(${round(origin[0])}px, ${round(origin[1] + depth)}px) skewY(${skew}deg) scaleY(calc(-${depth} - var(--lift)))`,
});

/** A raised block: top face in plan, two side faces stretched in screen space so the face can lift and press. */
export function Block({
  sceneId,
  projection,
  runs,
  face,
  depth = 16,
  isHero = false,
  isAccented = isHero,
  pressAt,
  landAt,
  hasShadow = true,
  children,
}: BlockProps) {
  const [a, b, c, d] = projection;
  const projected = corners(face).map((point) => project(point, projection));
  const [topLeft, , bottomRight, bottomLeft] = projected as [
    Point,
    Point,
    Point,
    Point,
  ];
  const leftWidth = round(bottomLeft[0] - topLeft[0]);
  const frontWidth = round(bottomRight[0] - bottomLeft[0]);
  const footprint = projected
    .map(([x, y]) => `${round(x - 4)},${round(y + depth + 7)}`)
    .join(" ");
  const { x, y, width, height } = face;

  return (
    <g
      className={isAccented ? `${styles.box} ${styles.hero}` : styles.box}
      data-hover-lift={isHero ? "" : undefined}
      style={
        landAt
          ? ({ "--land-at": `${round(landAt)}ms` } as CSSProperties)
          : undefined
      }
    >
      <g
        key={runs}
        className={styles.lift}
        data-press={pressAt === undefined ? undefined : ""}
        style={pressAt === undefined ? undefined : at(pressAt)}
      >
        {/* data-part lets an entrance in another module move the body while the shadow stays on the floor */}
        {hasShadow && (
          <polygon
            className={styles.shadow}
            data-part="shadow"
            points={footprint}
            filter={`url(#${sceneId}-blur)`}
          />
        )}
        <g className={styles.body} data-part="body">
          <g style={sideTransform(topLeft, skewOf([c, d]), depth)}>
            <path className={styles.faceLeft} d={`M0 0H${leftWidth}V1H0Z`} />
            <path className={styles.edge} d={`M0 1V0H${leftWidth}`} />
          </g>
          <g style={sideTransform(bottomLeft, skewOf([a, b]), depth)}>
            <path className={styles.faceFront} d={`M0 0H${frontWidth}V1H0Z`} />
            <path className={styles.edgeInner} d="M0 0V1" />
            <path className={styles.edge} d={`M0 0H${frontWidth}V1`} />
          </g>
          <g className={styles.top}>
            <g transform={planTransform(projection)}>
              <rect
                className={styles.faceTop}
                x={x}
                y={y}
                width={width}
                height={height}
              />
              <path
                className={styles.edgeInner}
                d={`M${x} ${y}V${y + height}H${x + width}`}
              />
              <path
                className={styles.edge}
                d={`M${x} ${y}H${x + width}V${y + height}`}
              />
              {children}
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}
