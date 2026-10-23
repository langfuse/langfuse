"use client";

import type { ReactNode } from "react";
import { Frame } from "./Frame";
import type { Keyframes } from "./keyframes";
import {
  planTransform,
  type Floor,
  type Projection,
  type Rect,
  type ViewBox,
} from "./projection";
import styles from "./Scene.module.css";
import type { Playback } from "./usePlayback";
import type { SceneLook } from "./useScene";

/** What every scene's layout gives the frame, next to its own geometry. */
export type SceneLayout = {
  projection: Projection;
  viewBox: ViewBox;
  floor: Floor;
  /** A tinted plate lying on the plane, in plan units, like the bottom-row landing images' tilted floor. */
  plate: Rect | null;
  /** On the panel floor, fades carries the grid past the panel; stops ends it at the panel and plate. */
  panelGrid: "fades" | "stops";
  keyframes: Keyframes[];
  ariaLabel: string;
  runDuration: number;
};

type SceneProps = Pick<SceneLook, "floor" | "accent" | "a11y"> & {
  id: string;
  layout: SceneLayout;
  playback: Playback;
  lift: "hover" | "off";
  /** The scene's own gradients, patterns and clips. */
  defs: ReactNode;
  children: ReactNode;
};

/** A grid fade too small to show, so only the panel and plate keep the grid. */
const STOPPED_FADE_RADIUS = 0.01;

/** A product scene's svg: the frame, filling its parent's width, with the layout's floor, plate and generated keyframes. */
export function Scene({
  id,
  layout,
  playback,
  lift,
  floor,
  accent,
  a11y,
  defs,
  children,
}: SceneProps) {
  const { plate, projection } = layout;
  const floorShape =
    floor === "panel" && layout.panelGrid === "stops"
      ? {
          ...layout.floor,
          fade: { ...layout.floor.fade, r: STOPPED_FADE_RADIUS },
        }
      : layout.floor;

  return (
    <Frame
      id={id}
      label={a11y === "described" ? layout.ariaLabel : null}
      viewBox={layout.viewBox}
      floor={floorShape}
      floorKind={floor}
      projection={projection}
      fit="width"
      accent={accent}
      lift={lift}
      playback={playback}
      floorMask={
        plate && (
          <rect {...plate} transform={planTransform(projection)} fill="white" />
        )
      }
      underlay={
        plate && (
          <g transform={planTransform(projection)}>
            <rect className={styles.panel} {...plate} />
          </g>
        )
      }
    >
      {layout.keyframes.length > 0 && (
        <style>{layout.keyframes.map(({ css }) => css).join("\n")}</style>
      )}
      <defs>{defs}</defs>
      {children}
    </Frame>
  );
}
