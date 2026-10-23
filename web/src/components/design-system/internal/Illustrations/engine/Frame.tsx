"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import {
  planTransform,
  type Floor,
  type Projection,
  type ViewBox,
} from "./projection";
import styles from "./Scene.module.css";
import type { Playback } from "./usePlayback";

/** ms the stage fades in ahead of everything else in a first build; every other time in that run starts this much later. */
export const BUILD_LEAD = 80;

type FrameProps = {
  /** Prefix for this instance's defs and generated keyframes (useIllustrationId). */
  id: string;
  /** The accessible name; null when the art is decorative because nearby text says the same. */
  label: string | null;
  viewBox: ViewBox;
  floor: Floor;
  floorKind: "panel" | "grid" | "none";
  projection: Projection;
  /** width fills the parent's width; height fills the parent's height. */
  fit: "width" | "height";
  accent: "none" | "highlight";
  lift: "hover" | "off";
  playback: Playback;
  /** White shapes that keep the grid showing past the fade, such as a plate's footprint. */
  floorMask: ReactNode;
  /** Drawn on the floor under the grid, such as a tinted plate. */
  underlay: ReactNode;
  children: ReactNode;
};

const FIT_CLASS: Record<FrameProps["fit"], string | undefined> = {
  width: styles.fitWidth,
  height: styles.fitHeight,
};

/** The svg root every illustration renders into: the floor, the shared defs and the run state, as data attributes the styles read. */
export function Frame({
  id,
  label,
  viewBox,
  floor,
  floorKind,
  projection,
  fit,
  accent,
  lift,
  playback,
  floorMask,
  underlay,
  children,
}: FrameProps) {
  const { runs, startsHidden, observe } = playback;
  const isBuilding = runs === 1 && startsHidden;
  const showsPanel = floorKind === "panel";

  return (
    <svg
      ref={observe}
      viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
      {...(label === null
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label })}
      focusable="false"
      className={`${styles.root} ${FIT_CLASS[fit]}`}
      style={
        isBuilding
          ? ({
              "--illustration-build-lead": `${BUILD_LEAD}ms`,
            } as CSSProperties)
          : undefined
      }
      data-accent={accent === "none" ? undefined : accent}
      data-lift={lift === "off" ? "off" : undefined}
      data-pending={runs === 0 && startsHidden ? "" : undefined}
      data-running={runs > 0 ? "" : undefined}
      data-from={isBuilding ? "hidden" : undefined}
    >
      <defs>
        <radialGradient
          id={`${id}-fade-gradient`}
          gradientUnits="userSpaceOnUse"
          cx={floor.fade.cx}
          cy={floor.fade.cy}
          r={floor.fade.r}
        >
          <stop
            offset={showsPanel ? 0.6 : 0.35}
            stopColor="white"
            stopOpacity={0.95}
          />
          <stop offset={1} stopColor="white" stopOpacity={0} />
        </radialGradient>
        <mask
          id={`${id}-fade`}
          maskUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={viewBox.width}
          height={viewBox.height}
        >
          <rect
            width={viewBox.width}
            height={viewBox.height}
            fill={`url(#${id}-fade-gradient)`}
          />
          {showsPanel && <rect {...floor.panel} fill="white" />}
          {showsPanel && floorMask}
        </mask>
        <filter id={`${id}-blur`} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation={6} />
        </filter>
      </defs>

      {showsPanel && <rect className={styles.panel} {...floor.panel} />}
      {showsPanel && underlay}
      {floorKind !== "none" && (
        <g mask={`url(#${id}-fade)`}>
          <path
            className={styles.grid}
            transform={planTransform(projection)}
            d={floor.gridPath}
          />
        </g>
      )}

      {/* The stage: everything on the floor, which a first build fades in before the hero lands */}
      <g className={styles.stage}>{children}</g>
    </svg>
  );
}

/** A prefix for this instance's defs and generated keyframes, safe inside url(#…). */
export function useIllustrationId() {
  return `ill${useId().replace(/[^\w-]/g, "")}`;
}
