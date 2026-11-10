"use client";

import type { CSSProperties } from "react";
import { activeIndexOf } from "../../engine/activeIndex";
import { Block } from "../../engine/Block";
import { Chip } from "../../engine/Chip";
import { CountUp } from "../../engine/CountUp";
import { at } from "../../engine/motion";
import { Packet } from "../../engine/Packet";
import { planTransform } from "../../engine/projection";
import { Scene } from "../../engine/Scene";
import scene from "../../engine/Scene.module.css";
import { StatusDot } from "../../engine/StatusDot";
import { SlotContent } from "../../engine/SlotContent";
import { TypeOut } from "../../engine/TypeOut";
import { useScene } from "../../engine/useScene";
import type { SceneProps } from "../registry";
import { HALO_DEFAULTS } from "./content";
import styles from "./halo.module.css";
import { layoutHaloJobs } from "./layout";

/** Halo doing a job for you: your message types in, passes into Halo, its steps land as cards and the result counts up; the job changes each run. */
export function HaloScene({
  content,
  motion,
  floor,
  accent,
  a11y,
}: SceneProps<"halo">) {
  const {
    id,
    layout: all,
    playback,
    lift,
  } = useScene(HALO_DEFAULTS, content, layoutHaloJobs, motion);
  const { runs } = playback;
  const layout = all.jobs[activeIndexOf(all.active, runs, all.jobs.length)]!;
  const { message, hero, rows, result, run, offset } = layout;
  /** Every run after the first shows the next job. */
  const isReplay = runs > 1;

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
      <g transform={`translate(${offset.x} ${offset.y})`}>
        <g key={runs} transform={planTransform(layout.projection)}>
          <rect className={scene.card} {...message.card} />
          {/* A replay shows the next job's ask: hidden from the run's start until it types, so it never shows whole */}
          <text
            className={
              isReplay ? `${styles.message} ${scene.fadeIn}` : styles.message
            }
            x={message.textX}
            y={message.baseline}
            style={
              isReplay
                ? ({
                    ...at(message.typeAt, 0, 60),
                    "--illustration-clear-for": "0ms",
                    fontSize: message.size,
                  } as CSSProperties)
                : { fontSize: message.size }
            }
          >
            <TypeOut
              playback={playback}
              text={message.ask.text}
              at={message.typeAt}
              perChar={message.perChar}
            />
            <title>{message.ask.full}</title>
          </text>
          <path className={scene.wire} d={layout.inlet} />
          <path className={scene.wire} d={layout.trunk} />
          {runs > 0 && (
            <>
              <Packet keyframes={layout.drop.keyframes} at={layout.drop.at} />
              {rows.map((row, index) => (
                <Packet key={index} keyframes={row.packet} at={row.departAt} />
              ))}
            </>
          )}

          {rows.map((row, index) => (
            <g key={index} data-tone="pass">
              <g className={scene.rise} style={at(row.arriveAt, row.clearAt)}>
                <rect className={scene.card} {...row.card} />
                <Chip
                  x={row.chip.x}
                  y={row.chip.y}
                  slot={row.verb}
                  variant="soft"
                  fontSize={layout.chip.size}
                  padX={layout.chip.padX}
                />
                <text
                  className={styles.object}
                  x={row.textX}
                  y={row.mid + layout.textSize * 0.35}
                  style={{ fontSize: layout.textSize }}
                >
                  <SlotContent slot={row.object} />
                </text>
              </g>
              <g
                className={scene.pop}
                style={at(row.arriveAt + run.dot, row.clearAt)}
              >
                <StatusDot x={row.dot.x} y={row.dot.y} />
              </g>
            </g>
          ))}

          {/* What you get, rising once the last step has landed */}
          <g data-tone="pass" className={scene.rise} style={at(result.at)}>
            <rect className={styles.result} {...result.card} />
            <text
              className={scene.name}
              x={result.labelX}
              y={result.baseline}
              style={{ fontSize: result.size }}
            >
              <SlotContent slot={result.label} />
            </text>
            <text
              className={scene.ink}
              x={result.valueX}
              y={result.baseline}
              textAnchor="end"
              style={{ fontSize: result.size }}
            >
              <CountUp
                playback={playback}
                value={result.value}
                at={result.at}
                duration={run.count}
              />
            </text>
            <StatusDot x={result.dot.x} y={result.dot.y} />
          </g>
        </g>

        <Block
          sceneId={id}
          projection={layout.projection}
          runs={runs}
          face={hero.face}
          depth={hero.depth}
          isHero
          pressAt={hero.pressAt}
        >
          <ellipse className={styles.mark} {...hero.mark.halo} />
          <path className={styles.mark} d={hero.mark.head} />
          <path className={styles.mark} d={hero.mark.features} />
          <text
            className={scene.name}
            x={hero.nameX}
            y={hero.baseline}
            style={{ fontSize: hero.size }}
          >
            {hero.name}
          </text>
        </Block>
      </g>
    </Scene>
  );
}
