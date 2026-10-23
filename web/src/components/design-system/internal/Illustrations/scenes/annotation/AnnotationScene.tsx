"use client";

import type { CSSProperties } from "react";
import { Block } from "../../engine/Block";
import { CountUp } from "../../engine/CountUp";
import { at } from "../../engine/motion";
import { planTransform } from "../../engine/projection";
import { Scene } from "../../engine/Scene";
import scene from "../../engine/Scene.module.css";
import { SlotContent } from "../../engine/SlotContent";
import type { Slot } from "../../engine/slots";
import { TypeOut } from "../../engine/TypeOut";
import { useScene } from "../../engine/useScene";
import type { SceneProps } from "../registry";
import styles from "./annotation.module.css";
import { ANNOTATION_DEFAULTS } from "./content";
import { layoutAnnotation } from "./layout";

function Caption({
  caption,
  fontSize,
}: {
  caption: { slot: Slot; x: number; baseline: number };
  fontSize: number;
}) {
  return (
    <text
      className={scene.label}
      style={{ fontSize }}
      x={caption.x}
      y={caption.baseline}
    >
      <SlotContent slot={caption.slot} />
    </text>
  );
}

/** A reviewer fills in an annotation form: picks a category, sets the boolean, and scores the answer. */
export function AnnotationScene({
  content,
  motion,
  floor,
  accent,
  a11y,
}: SceneProps<"annotation">) {
  const { id, layout, playback, lift } = useScene(
    ANNOTATION_DEFAULTS,
    content,
    layoutAnnotation,
    motion,
  );
  const { runs } = playback;
  const { labels, dropdown, toggle, score, run, sizes } = layout;
  const value = { fontSize: sizes.value };

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
        <pattern
          id={`${id}-hatch`}
          patternUnits="userSpaceOnUse"
          width={3.05}
          height={8}
          patternTransform="skewX(-19.15)"
        >
          <path className={styles.hatchLine} d="M0.5 0V8" />
        </pattern>
      }
    >
      <g className={styles.form}>
        <g key={runs} transform={planTransform(layout.projection)}>
          <rect className={scene.card} {...dropdown.card} />
          <text
            className={`${styles.soft} ${scene.fadeIn}`}
            style={{ ...value, ...at(run.typeAt, 0, 60) }}
            x={dropdown.valueX}
            y={dropdown.baseline}
          >
            <TypeOut
              playback={playback}
              text={dropdown.value.text}
              at={run.typeAt}
              perChar={run.perChar}
            />
            {dropdown.value.text !== dropdown.value.full && (
              <title>{dropdown.value.full}</title>
            )}
          </text>
          <path className={styles.chevron} d={dropdown.chevron} />
          <path
            className={`${styles.chevron} ${styles.chevronFlash}`}
            style={at(run.flash)}
            d={dropdown.chevron}
          />
          <Caption caption={labels.category} fontSize={sizes.label} />

          <rect className={scene.card} {...toggle.other.card} />
          <text
            className={styles.soft}
            style={value}
            x={toggle.other.x}
            y={toggle.other.baseline}
            textAnchor="middle"
          >
            {toggle.other.text}
          </text>
          <Caption caption={labels.check} fontSize={sizes.label} />

          <rect className={scene.card} {...score.bar} />
          <mask
            id={`${id}-remainder`}
            maskUnits="userSpaceOnUse"
            {...score.bar}
          >
            <rect
              className={styles.remainderMask}
              style={
                {
                  "--empty-scale": score.emptyScale,
                  ...at(run.fillAt, 0, run.fillFor),
                } as CSSProperties
              }
              {...score.remainder}
              fill="white"
            />
          </mask>
          <rect
            {...score.bar}
            fill={`url(#${id}-hatch)`}
            mask={`url(#${id}-remainder)`}
          />
          <text
            className={`${styles.soft} ${scene.fadeIn}`}
            style={{ ...value, ...at(run.fillAt, 0, 120) }}
            x={score.textX}
            y={score.baseline}
            textAnchor="middle"
          >
            <CountUp
              playback={playback}
              value={score.text}
              at={run.fillAt}
              duration={run.fillFor}
            />
            {score.text.text !== score.text.full && (
              <title>{score.text.full}</title>
            )}
          </text>
          <Caption caption={labels.score} fontSize={sizes.label} />
        </g>

        <g key={`ticks-${runs}`}>
          {score.ticks.map((tick, index) => (
            <line
              key={index}
              className={`${styles.tick} ${scene.fadeIn}`}
              style={at(tick.at, 0, 120)}
              {...tick}
            />
          ))}
        </g>

        <Block
          sceneId={id}
          projection={layout.projection}
          runs={runs}
          face={toggle.face}
          depth={toggle.depth}
          isHero
          pressAt={run.press}
        >
          <text
            className={scene.name}
            style={value}
            x={toggle.chosen.x}
            y={toggle.chosen.baseline}
            textAnchor="middle"
          >
            {toggle.chosen.text}
          </text>
        </Block>
      </g>
    </Scene>
  );
}
