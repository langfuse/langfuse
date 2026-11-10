"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  planTransform,
  type Floor,
  type Projection,
  type Rect,
  type ViewBox,
} from "./projection";
import { BUILD_LEAD, CLEAR_FOR } from "./motion";
import styles from "./Scene.module.css";
import type { Playback } from "./usePlayback";

/** The floor under the art: a tinted panel with the grid fading past it, the fading grid alone, or nothing. */
export type Backdrop = "panel" | "grid" | "none";
/** highlight paints the hero's face and the solid chips in the brand's black (white in dark mode). */
export type Accent = "none" | "highlight";
/** hover lifts the hero while the host is hovered or holds keyboard focus. */
export type Lift = "hover" | "off";

type FrameProps = {
  /** Prefix for this instance's ids (useIllustrationId). */
  id: string;
  /** The accessible name; null when the art is decorative because nearby text says the same. */
  label: string | null;
  viewBox: ViewBox;
  floor: Floor;
  backdrop: Backdrop;
  projection: Projection;
  /** width fills the parent's width; height fills the parent's height. */
  fit: "width" | "height";
  accent: Accent;
  lift: Lift;
  playback: Playback;
  /** A tinted plate lying on the floor, in plan units; on the panel backdrop the grid stays on it past the fade. */
  plate: Rect | null;
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
  backdrop,
  projection,
  fit,
  accent,
  lift,
  playback,
  plate,
  children,
}: FrameProps) {
  const { runs, startsHidden, isHostActive, observe } = playback;
  const isBuilding = runs === 1 && startsHidden;
  const showsPanel = backdrop === "panel";

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
        {
          "--illustration-clear-for": `${isBuilding ? 0 : CLEAR_FOR}ms`,
          "--illustration-build-lead": isBuilding
            ? `${BUILD_LEAD}ms`
            : undefined,
        } as CSSProperties
      }
      data-accent={accent === "none" ? undefined : accent}
      data-lift={lift === "off" ? "off" : undefined}
      data-host-active={isHostActive ? "" : undefined}
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
          {showsPanel && plate && (
            <rect
              {...plate}
              transform={planTransform(projection)}
              fill="white"
            />
          )}
        </mask>
        <filter id={`${id}-blur`} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation={6} />
        </filter>
      </defs>

      {showsPanel && <rect className={styles.panel} {...floor.panel} />}
      {showsPanel && plate && (
        <g transform={planTransform(projection)}>
          <rect className={styles.panel} {...plate} />
        </g>
      )}
      {backdrop !== "none" && (
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
