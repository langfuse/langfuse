"use client";

import { Block } from "../../engine/Block";
import { CountUp } from "../../engine/CountUp";
import { play } from "../../engine/keyframes";
import { at } from "../../engine/motion";
import { planTransform } from "../../engine/projection";
import { Scene } from "../../engine/Scene";
import scene from "../../engine/Scene.module.css";
import { SlotContent } from "../../engine/SlotContent";
import { useScene } from "../../engine/useScene";
import type { SceneProps } from "../registry";
import { EVALUATION_DEFAULTS } from "./content";
import styles from "./evaluation.module.css";
import { layoutEvaluation } from "./layout";

const TONES = ["pass", "fail", "neutral"] as const;

/** An execution runs into the evaluator, which scores it row by row. */
export function EvaluationScene({
  content,
  motion,
  floor,
  accent,
  a11y,
}: SceneProps<"evaluation">) {
  const { id, layout, playback, lift } = useScene(
    EVALUATION_DEFAULTS,
    content,
    layoutEvaluation,
    motion,
  );
  const { runs } = playback;
  const { execution, evaluator, trunk, rows, run } = layout;

  return (
    <Scene
      id={id}
      layout={layout}
      playback={playback}
      lift={lift}
      floor={floor}
      accent={accent}
      a11y={a11y}
      defs={TONES.map((tone) => (
        <linearGradient
          key={tone}
          id={`${id}-${tone}`}
          data-tone={tone}
          gradientUnits="userSpaceOnUse"
          x1={trunk.x}
          y1={0}
          x2={trunk.cardX}
          y2={0}
        >
          <stop offset={0} className={scene.stopLine} />
          <stop offset={0.45} className={scene.stopTone} stopOpacity={0.85} />
          <stop offset={1} className={scene.stopTone} />
        </linearGradient>
      ))}
    >
      <g key={runs} transform={planTransform(layout.projection)}>
        <rect
          className={`${scene.card} ${scene.flash}`}
          style={at(run.flash)}
          {...execution.card}
        />
        <text
          className={scene.label}
          x={execution.textX}
          y={execution.baseline}
        >
          <SlotContent slot={execution.slot} />
        </text>

        <path
          className={scene.wire}
          d={[
            `M${trunk.x} ${trunk.top}V${trunk.bottom}`,
            ...rows.map(({ mid }) => `M${trunk.x} ${mid}H${trunk.cardX}`),
          ].join("")}
        />
        <rect
          className={`${scene.socket} ${scene.flashFill}`}
          style={at(run.flash)}
          x={trunk.x - 3}
          y={trunk.top - 3}
          width={6}
          height={6}
        />

        {runs > 0 && (
          <rect
            className={scene.packet}
            x={-2.5}
            y={-2.5}
            width={5}
            height={5}
            style={play(run.packetIn, run.inAt)}
          />
        )}

        {rows.map((row, index) => (
          <g key={index} data-tone={row.status}>
            {runs > 0 && (
              <rect
                className={scene.packet}
                x={-2.5}
                y={-2.5}
                width={5}
                height={5}
                style={play(row.packet, run.packetsOut)}
              />
            )}
            <rect className={scene.card} {...row.card} />
            <path
              className={`${styles.branch} ${scene.draw}`}
              style={at(row.drawAt, row.clearAt, row.drawFor)}
              pathLength={1}
              d={`M${trunk.x} ${row.mid}H${trunk.cardX}`}
              stroke={`url(#${id}-${row.status})`}
            />
            <rect
              className={`${scene.toned} ${scene.pop}`}
              style={at(row.arriveAt, row.clearAt)}
              x={trunk.cardX - 2.5}
              y={row.mid - 2.5}
              width={5}
              height={5}
            />
            <text className={scene.label} x={row.labelX} y={row.labelBaseline}>
              <SlotContent slot={row.name} />
            </text>
            <g
              className={scene.pop}
              style={at(row.arriveAt + run.dot, row.clearAt)}
            >
              <circle className={scene.halo} cx={row.dotX} cy={row.mid} r={6} />
              <circle
                className={scene.toned}
                cx={row.dotX}
                cy={row.mid}
                r={3.6}
              />
            </g>
            <circle
              className={scene.ripple}
              style={at(row.arriveAt + run.dot)}
              cx={row.dotX}
              cy={row.mid}
              r={5.5}
            />
            <text
              className={`${scene.ink} ${scene.slide}`}
              style={at(row.arriveAt + run.value, row.clearAt)}
              x={row.valueX}
              y={row.valueBaseline}
            >
              <CountUp
                playback={playback}
                value={row.value}
                at={row.arriveAt + run.value}
                duration={run.count}
              />
              {row.value.text !== row.value.full && (
                <title>{row.value.full}</title>
              )}
            </text>
          </g>
        ))}
      </g>

      <Block
        sceneId={id}
        projection={layout.projection}
        runs={runs}
        face={evaluator.face}
        isHero
        pressAt={run.press}
      >
        <text
          className={scene.name}
          x={evaluator.textX}
          y={evaluator.baseline}
          textAnchor="middle"
        >
          <SlotContent slot={evaluator.slot} />
        </text>
      </Block>
    </Scene>
  );
}
