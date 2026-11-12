"use client";

import { Fragment } from "react";
import { cn } from "@/src/utils/tailwind";
import { Chip } from "../../engine/Chip";
import { play } from "../../engine/keyframes";
import { at } from "../../engine/motion";
import { planTransform } from "../../engine/projection";
import { Scene } from "../../engine/Scene";
import scene from "../../engine/Scene.module.css";
import { TypeOut } from "../../engine/TypeOut";
import { useScene } from "../../engine/useScene";
import type { SceneProps } from "../registry";
import { EXPERIMENTS_DEFAULTS } from "./content";
import styles from "./experiments.module.css";
import { layoutExperiments } from "./layout";

/** Plan-space area the fade masks cover, past the plate on every side. */
const MASK_AREA = { x: -400, y: -200, width: 1000, height: 900 };

/** Two experiment runs drawn as series on a chart lying on the floor; the crosshair reads the first. */
export function ExperimentsScene({
  content,
  motion,
  floor,
  accent,
  a11y,
}: SceneProps<"experiments">) {
  const { id, layout, playback, lift } = useScene(
    EXPERIMENTS_DEFAULTS,
    content,
    layoutExperiments,
    motion,
  );
  const { runs } = playback;
  const isBuilding = runs === 1 && playback.startsHidden;
  const { chart, guides, series, runId, run, fade, plate, crosshair } = layout;
  const plan = planTransform(layout.projection);
  const hero = series[0];
  const fadeLines = {
    u: { x1: fade.u[0], y1: 0, x2: fade.u[1], y2: 0 },
    v: { x1: 0, y1: fade.v[0], x2: 0, y2: fade.v[1] },
  };

  return (
    <Scene
      id={id}
      layout={layout}
      playback={playback}
      lift={lift}
      floor={floor}
      accent={accent}
      a11y={a11y}
      defs={
        <>
          <pattern
            id={`${id}-hatch`}
            patternUnits="userSpaceOnUse"
            width={4.5}
            height={4.5}
          >
            <path
              className={styles.hatchLine}
              d="M-1 1L1 -1M0 4.5L4.5 0M3.5 5.5L5.5 3.5"
            />
          </pattern>
          {/* A fade along each plan axis, as plan-space masks: they are only used inside the plan transform */}
          {Object.entries(fadeLines).map(([axis, line]) => (
            <Fragment key={axis}>
              <linearGradient
                id={`${id}-fade-${axis}`}
                gradientUnits="userSpaceOnUse"
                {...line}
              >
                <stop offset={0} stopColor="white" />
                <stop offset={1} stopColor="white" stopOpacity={0} />
              </linearGradient>
              <mask
                id={`${id}-mask-${axis}`}
                maskUnits="userSpaceOnUse"
                {...MASK_AREA}
              >
                <rect {...MASK_AREA} fill={`url(#${id}-fade-${axis})`} />
              </mask>
            </Fragment>
          ))}
          <clipPath id={`${id}-plate`}>
            <rect {...plate} />
          </clipPath>
        </>
      }
    >
      {floor !== "none" && (
        <g transform={plan} clipPath={`url(#${id}-plate)`}>
          <g mask={`url(#${id}-mask-u)`}>
            <g mask={`url(#${id}-mask-v)`}>
              <path className={scene.grid} d={layout.gridPath} />
            </g>
          </g>
        </g>
      )}

      <g key={runs} transform={plan}>
        <g mask={`url(#${id}-mask-u)`}>
          {guides.map(({ v, dashed, opacity, at: guideAt }) => (
            <g key={v} opacity={opacity}>
              <path
                className={`${dashed ? styles.guideDashed : styles.guideSolid} ${scene.fadeIn}`}
                style={at(guideAt, 0, run.guideFade)}
                d={`M${chart.x0} ${v}H${chart.x1}`}
              />
            </g>
          ))}
          {hero?.area && (
            <path
              className={`${styles.area} ${scene.fadeIn}`}
              style={at(run.hatch, 0, run.hatchFade)}
              d={hero.area}
              fill={`url(#${id}-hatch)`}
            />
          )}
          {series
            .slice()
            .reverse()
            .map((entry) => (
              <path
                key={entry.hero ? "hero" : "other"}
                className={`${styles.series} ${entry.hero ? styles.heroLine : styles.otherLine} ${scene.draw}`}
                style={at(entry.drawAt, 0, run.draw)}
                pathLength={1}
                d={entry.path}
              />
            ))}
        </g>

        {/* The hero's chip anchors the run: it stays while its line redraws from it */}
        {series.map((entry) => (
          <g
            key={entry.hero ? "hero" : "other"}
            className={
              entry.hero
                ? cn(styles.heroChip, isBuilding && styles.building)
                : scene.slide
            }
            style={entry.hero ? undefined : at(run.otherChip)}
          >
            <Chip
              x={entry.chip.x}
              y={entry.chip.y}
              slot={entry.label}
              variant={entry.chip.variant}
              fontSize={layout.chipFont}
              padX={layout.chipPadX}
            />
          </g>
        ))}

        {runs > 0 && crosshair && (
          <>
            <g className={styles.cross} style={play(crosshair.line, run.scrub)}>
              <path
                className={styles.crossLine}
                d={`M0 ${chart.top - 8}V${chart.base}`}
              />
            </g>
            <g className={styles.cross} style={play(crosshair.dot, run.scrub)}>
              <circle className={styles.crossHalo} r={6} />
              <circle className={styles.crossDot} r={3.4} />
            </g>
          </>
        )}

        <text
          className={`${scene.label} ${scene.fadeIn}`}
          style={{ ...at(run.label, 0, 150), fontSize: runId.fontSize }}
          x={runId.x}
          y={runId.baseline}
        >
          <TypeOut
            playback={playback}
            text={runId.slot.text}
            at={run.label}
            perChar={run.perChar}
          />
          {runId.slot.text !== runId.slot.full && (
            <title>{runId.slot.full}</title>
          )}
        </text>
      </g>
    </Scene>
  );
}
