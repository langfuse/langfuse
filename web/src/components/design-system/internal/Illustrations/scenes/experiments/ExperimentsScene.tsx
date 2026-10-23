"use client";

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
  const { chart, guides, series, run, timing, fade, plate } = layout;
  const [crossDot, crossLine] = layout.crosshair;
  const plan = planTransform(layout.projection);
  const hero = series[0];

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
          <linearGradient
            id={`${id}-fade-u`}
            gradientUnits="userSpaceOnUse"
            x1={fade.u[0]}
            y1={0}
            x2={fade.u[1]}
            y2={0}
          >
            <stop offset={0} stopColor="white" />
            <stop offset={1} stopColor="white" stopOpacity={0} />
          </linearGradient>
          <linearGradient
            id={`${id}-fade-v`}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={fade.v[0]}
            x2={0}
            y2={fade.v[1]}
          >
            <stop offset={0} stopColor="white" />
            <stop offset={1} stopColor="white" stopOpacity={0} />
          </linearGradient>
          {/* Plan-space masks: they are only used inside the plan transform */}
          <mask
            id={`${id}-mask-u`}
            maskUnits="userSpaceOnUse"
            x={-400}
            y={-200}
            width={1000}
            height={900}
          >
            <rect
              x={-400}
              y={-200}
              width={1000}
              height={900}
              fill={`url(#${id}-fade-u)`}
            />
          </mask>
          <mask
            id={`${id}-mask-v`}
            maskUnits="userSpaceOnUse"
            x={-400}
            y={-200}
            width={1000}
            height={900}
          >
            <rect
              x={-400}
              y={-200}
              width={1000}
              height={900}
              fill={`url(#${id}-fade-v)`}
            />
          </mask>
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
                style={at(guideAt, 0, timing.guideFade)}
                d={`M${chart.x0} ${v}H${chart.x1}`}
              />
            </g>
          ))}
          {hero?.area && (
            <path
              className={`${styles.area} ${scene.fadeIn}`}
              style={at(timing.hatch, 0, timing.hatchFade)}
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
                style={at(entry.drawAt, 0, timing.draw)}
                pathLength={1}
                d={entry.path}
              />
            ))}
        </g>

        {series.map((entry) => (
          <g
            key={entry.hero ? "hero" : "other"}
            className={entry.hero ? styles.heroChip : styles.softChip}
          >
            {/* The hero's chip anchors the run: it stays while its line redraws from it */}
            <g
              className={entry.hero ? undefined : scene.slide}
              style={entry.hero ? undefined : at(entry.chipAt)}
            >
              <Chip
                x={entry.chip.x}
                y={entry.chip.y}
                slot={entry.label}
                tone={entry.chip.tone}
                fontSize={layout.chipFont}
                padX={layout.chipPadX}
              />
            </g>
          </g>
        ))}

        {runs > 0 && crossDot && crossLine && (
          <>
            <g className={styles.cross} style={play(crossLine, timing.scrub)}>
              <path
                className={styles.crossLine}
                d={`M0 ${chart.top - 8}V${chart.base}`}
              />
            </g>
            <g className={styles.cross} style={play(crossDot, timing.scrub)}>
              <circle className={styles.crossHalo} r={6} />
              <circle className={styles.crossDot} r={3.4} />
            </g>
          </>
        )}

        <text
          className={`${scene.label} ${scene.fadeIn}`}
          style={{ ...at(timing.label, 0, 150), fontSize: run.fontSize }}
          x={run.x}
          y={run.baseline}
        >
          <TypeOut
            playback={playback}
            text={run.slot.text}
            at={timing.label}
            perChar={timing.perChar}
          />
          {run.slot.text !== run.slot.full && <title>{run.slot.full}</title>}
        </text>
      </g>
    </Scene>
  );
}
