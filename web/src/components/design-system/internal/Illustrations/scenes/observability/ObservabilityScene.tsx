"use client";

import { Block } from "../../engine/Block";
import { CountUp } from "../../engine/CountUp";
import { play } from "../../engine/keyframes";
import { at } from "../../engine/motion";
import { planTransform } from "../../engine/projection";
import { Scene } from "../../engine/Scene";
import scene from "../../engine/Scene.module.css";
import { SlotContent } from "../../engine/SlotContent";
import type { Playback } from "../../engine/usePlayback";
import { useScene } from "../../engine/useScene";
import type { SceneProps } from "../registry";
import { OBSERVABILITY_DEFAULTS } from "./content";
import { layoutObservability, type ObservabilityRow } from "./layout";
import styles from "./observability.module.css";

function SpanText({
  row,
  playback,
}: {
  row: ObservabilityRow;
  playback: Playback;
}) {
  const size = { fontSize: row.fontSize };
  const onHero = row.hero ? styles.onHero : "";
  return (
    <>
      <text
        className={`${scene.ink2} ${onHero}`}
        x={row.nameX}
        y={row.baseline}
        style={size}
      >
        <SlotContent slot={row.name} />
      </text>
      <text
        className={scene.warm}
        x={row.durationX}
        y={row.baseline}
        style={size}
      >
        <CountUp
          playback={playback}
          value={row.duration}
          at={row.countAt}
          duration={row.countFor}
        />
      </text>
      <text
        className={`${scene.label} ${onHero}`}
        x={row.costX}
        y={row.baseline}
        style={size}
      >
        <CountUp
          playback={playback}
          value={row.cost}
          at={row.countAt}
          duration={row.countFor}
        />
      </text>
    </>
  );
}

/** A trace arriving: spans stream in under a sweeping playhead, and the selected one stands up from the rest. */
export function ObservabilityScene({
  content,
  motion,
  floor,
  accent,
  a11y,
}: SceneProps<"observability">) {
  const { id, layout, playback, lift } = useScene(
    OBSERVABILITY_DEFAULTS,
    content,
    layoutObservability,
    motion,
  );
  const { runs } = playback;
  const { axis, rows, run } = layout;
  const hero = rows.find((row) => row.hero);

  return (
    <Scene
      id={id}
      layout={layout}
      playback={playback}
      lift={lift}
      floor={floor}
      accent={accent}
      a11y={a11y}
      defs={null}
    >
      <g key={runs} transform={planTransform(layout.projection)}>
        {axis.ticks.map((tick, index) => (
          <g key={index}>
            <path
              className={scene.guide}
              d={`M${tick.x} ${axis.tickTop}V${axis.tickBottom}`}
            />
            <text
              className={`${scene.label} ${scene.fadeIn}`}
              style={{
                ...at(
                  run.scanAt +
                    (index * run.scanFor) / Math.max(1, axis.ticks.length - 1),
                  0,
                  200,
                ),
                fontSize: axis.fontSize,
              }}
              x={tick.x + axis.labelGap}
              y={axis.labelBaseline}
            >
              <SlotContent slot={tick.label} />
            </text>
          </g>
        ))}
        {runs > 0 && (
          <g className={styles.scan} style={play(run.scan, run.scanAt)}>
            <path d={`M0 ${axis.tickTop}V${axis.tickBottom}`} />
          </g>
        )}

        {rows.map((row, index) =>
          row.hero ? null : (
            <g key={index} opacity={row.opacity}>
              <g className={scene.rise} style={at(row.revealAt, row.clearAt)}>
                <rect
                  className={
                    index === 0 ? `${scene.card} ${scene.flash}` : scene.card
                  }
                  style={index === 0 ? at(run.flash) : undefined}
                  {...row.bar}
                />
                <SpanText row={row} playback={playback} />
              </g>
            </g>
          ),
        )}
      </g>

      {hero && (
        <Block
          sceneId={id}
          projection={layout.projection}
          runs={runs}
          face={hero.bar}
          isHero
          pressAt={run.press}
        >
          {/* The hero stays through the run; only its numbers recount */}
          <g key={runs}>
            <SpanText row={hero} playback={playback} />
          </g>
        </Block>
      )}
    </Scene>
  );
}
