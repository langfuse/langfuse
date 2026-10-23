"use client";

import { Block } from "../../engine/Block";
import { Chip } from "../../engine/Chip";
import { CountUp } from "../../engine/CountUp";
import { play } from "../../engine/keyframes";
import { at } from "../../engine/motion";
import { planTransform } from "../../engine/projection";
import { Scene } from "../../engine/Scene";
import scene from "../../engine/Scene.module.css";
import { SlotContent } from "../../engine/SlotContent";
import { TypeOut } from "../../engine/TypeOut";
import { useScene } from "../../engine/useScene";
import type { SceneProps } from "../registry";
import { HALO_DEFAULTS } from "./content";
import styles from "./halo.module.css";
import { activeJobIndex, layoutHaloJobs } from "./layout";

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
  const layout =
    all.jobs[activeJobIndex(all.active, runs, all.jobs.length)] ?? all.jobs[0]!;
  const { message, hero, rows, result, run, offset } = layout;

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
          <text
            className={styles.message}
            x={message.textX}
            y={message.baseline}
            style={{ fontSize: message.size }}
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
              <rect
                className={scene.packet}
                x={-2.5}
                y={-2.5}
                width={5}
                height={5}
                style={play(layout.drop.keyframes, layout.drop.at)}
              />
              {rows.map((row, index) => (
                <rect
                  key={index}
                  className={scene.packet}
                  x={-2.5}
                  y={-2.5}
                  width={5}
                  height={5}
                  style={play(row.packet, row.departAt)}
                />
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
                  tone="soft"
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
                <circle
                  className={scene.halo}
                  cx={row.dot.x}
                  cy={row.dot.y}
                  r={6}
                />
                <circle
                  className={scene.toned}
                  cx={row.dot.x}
                  cy={row.dot.y}
                  r={3.6}
                />
              </g>
            </g>
          ))}

          {/* What you get, rising once the last step has landed */}
          <g data-tone="pass" className={scene.rise} style={at(result.at)}>
            <rect className={styles.result} {...result.card} />
            <text
              className={scene.name}
              x={result.card.x + 12}
              y={result.mid + 5}
              style={{ fontSize: 14 }}
            >
              <SlotContent slot={result.label} />
            </text>
            <text
              className={scene.ink}
              x={result.valueX}
              y={result.mid + 5}
              textAnchor="end"
              style={{ fontSize: 14 }}
            >
              <CountUp
                playback={playback}
                value={result.value}
                at={result.at}
                duration={run.count}
              />
            </text>
            <circle
              className={scene.halo}
              cx={result.dot.x}
              cy={result.dot.y}
              r={6}
            />
            <circle
              className={scene.toned}
              cx={result.dot.x}
              cy={result.dot.y}
              r={3.6}
            />
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
