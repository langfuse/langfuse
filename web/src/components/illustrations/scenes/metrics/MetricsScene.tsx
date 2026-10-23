"use client";

import { CountUp } from "../../engine/CountUp";
import { play } from "../../engine/keyframes";
import { at } from "../../engine/motion";
import { planTransform } from "../../engine/projection";
import { Scene } from "../../engine/Scene";
import scene from "../../engine/Scene.module.css";
import { SlotContent } from "../../engine/SlotContent";
import { useScene } from "../../engine/useScene";
import type { SceneProps } from "../registry";
import { METRICS_DEFAULTS } from "./content";
import { layoutMetrics } from "./layout";
import styles from "./metrics.module.css";

/** Opacity along the line and along the axis (guides, hatch, dates), sampled from metrics.png. */
const LINE_FADE = [
  [0, 1],
  [0.48, 0.82],
  [0.628, 0.66],
  [0.735, 0.43],
  [0.853, 0.22],
  [1, 0],
] as const;
const AXIS_FADE = [
  [0, 1],
  [0.626, 1],
  [0.687, 0.78],
  [0.809, 0.45],
  [0.932, 0.13],
  [1, 0],
] as const;
const SCRUB_EASING = "cubic-bezier(0.45, 0, 0.25, 1)";
/** Hatch lines: 45° across the chart, 3.5px apart on screen, like the PNG. */
const HATCH = { spacing: 3.65, angle: 45 };

/** A series draws across the chart, then the crosshair scrubs to the marked point and its flag counts the value. */
export function MetricsScene({
  content,
  motion,
  floor,
  accent,
  a11y,
}: SceneProps<"metrics">) {
  const { id, layout, playback, lift } = useScene(
    METRICS_DEFAULTS,
    content,
    layoutMetrics,
    motion,
  );
  const { runs } = playback;
  const { chart, guides, dates, marker, tooltip, scrub, run } = layout;
  const tooltipText = { fontSize: layout.font.tooltip };
  const dateText = { fontSize: layout.font.date };

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
          <linearGradient
            id={`${id}-line`}
            gradientUnits="userSpaceOnUse"
            x1={chart.x}
            y1={0}
            x2={chart.end}
            y2={0}
          >
            {LINE_FADE.map(([offset, opacity]) => (
              <stop
                key={offset}
                offset={offset}
                className={styles.lineStop}
                stopOpacity={opacity}
              />
            ))}
          </linearGradient>
          <linearGradient
            id={`${id}-axis`}
            gradientUnits="userSpaceOnUse"
            x1={chart.x}
            y1={0}
            x2={chart.end}
            y2={0}
          >
            {AXIS_FADE.map(([offset, opacity]) => (
              <stop
                key={offset}
                offset={offset}
                stopColor="white"
                stopOpacity={opacity}
              />
            ))}
          </linearGradient>
          <mask
            id={`${id}-axis-fade`}
            maskUnits="userSpaceOnUse"
            x={-600}
            y={-200}
            width={1600}
            height={1200}
          >
            <rect
              x={-600}
              y={-200}
              width={1600}
              height={1200}
              fill={`url(#${id}-axis)`}
            />
          </mask>
          <pattern
            id={`${id}-hatch`}
            patternUnits="userSpaceOnUse"
            width={HATCH.spacing}
            height={12}
            patternTransform={`rotate(${HATCH.angle})`}
          >
            <path className={styles.hatchLine} d="M0.5 -2V14" />
          </pattern>
        </>
      }
    >
      <g key={runs} transform={planTransform(layout.projection)}>
        <g mask={`url(#${id}-axis-fade)`}>
          {layout.area !== "" && (
            <path
              className={scene.fadeIn}
              style={at(run.hatch, 0, run.hatchFor)}
              d={layout.area}
              fill={`url(#${id}-hatch)`}
            />
          )}
          {guides.map(({ v, dashed }, i) => (
            <path
              key={v}
              className={`${dashed ? styles.dashed : scene.wire} ${scene.fadeIn}`}
              style={at(run.guides + i * run.guideStep, 0, run.guideFor)}
              d={`M${chart.x} ${v}H${chart.x + chart.width}`}
            />
          ))}
          <path
            className={`${scene.wire} ${scene.flash}`}
            style={at(run.flash)}
            d={`M${chart.x} ${chart.baseline}H${chart.x + chart.width}`}
          />
          {dates.map(({ slot, x, y }, i) => (
            <text
              key={i}
              className={scene.label}
              x={x}
              y={y}
              style={dateText}
              textAnchor="end"
            >
              <SlotContent slot={slot} />
            </text>
          ))}
        </g>

        <path
          className={`${styles.line} ${scene.draw}`}
          style={at(run.line, 0, run.lineFor)}
          pathLength={1}
          d={layout.line}
          stroke={`url(#${id}-line)`}
        />

        <g className={scene.fadeIn} style={at(run.scrub, 0, run.reveal)}>
          <g
            style={
              runs > 0 ? play(scrub.pole, run.scrub, SCRUB_EASING) : undefined
            }
          >
            <path
              className={styles.pole}
              d={`M${marker.u} ${chart.top}V${chart.baseline}`}
            />
            <g className={styles.tooltip}>
              <rect className={scene.chip} {...tooltip.chip} />
              <text
                className={`${scene.chipText} ${styles.dim}`}
                x={tooltip.textX}
                y={tooltip.firstBaseline}
                style={tooltipText}
              >
                <SlotContent slot={tooltip.date} />
              </text>
              <text
                className={scene.chipText}
                x={tooltip.textX}
                y={tooltip.secondBaseline}
                style={tooltipText}
              >
                <CountUp
                  playback={playback}
                  value={tooltip.value}
                  at={run.scrub}
                  duration={run.scrubFor}
                />
                {tooltip.unit !== "" && ` ${tooltip.unit}`}
              </text>
            </g>
          </g>
          <g
            style={
              runs > 0 ? play(scrub.dot, run.scrub, SCRUB_EASING) : undefined
            }
          >
            <circle
              className={styles.dot}
              cx={marker.u}
              cy={marker.v}
              r={4.1}
            />
          </g>
        </g>
      </g>
    </Scene>
  );
}
