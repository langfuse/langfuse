"use client";

import { useState } from "react";
import { Block } from "../../engine/Block";
import { Chip } from "../../engine/Chip";
import { play } from "../../engine/keyframes";
import { at } from "../../engine/motion";
import { planTransform } from "../../engine/projection";
import { Scene } from "../../engine/Scene";
import scene from "../../engine/Scene.module.css";
import { SlotContent } from "../../engine/SlotContent";
import { useScene } from "../../engine/useScene";
import type { SceneProps } from "../registry";
import { AgentLogo } from "./AgentLogo";
import styles from "./agents.module.css";
import { AGENTS_DEFAULTS } from "./content";
import { activeAgentIndex, layoutAgents } from "./layout";

/** A coding agent at work: each tool call leaves the agent and lands in Langfuse as a span; the agent changes each run. */
export function AgentsScene({
  content,
  motion,
  floor,
  accent,
  a11y,
}: SceneProps<"agents">) {
  const { id, layout, playback, lift } = useScene(
    AGENTS_DEFAULTS,
    content,
    layoutAgents,
    motion,
  );
  const { runs } = playback;
  const { hero, rows, next, run, offset } = layout;
  const activeIndex = activeAgentIndex(
    layout.active,
    runs,
    layout.agents.length,
  );
  const agent = layout.agents[activeIndex]!;
  const logo = layout.logos[activeIndex];
  // A pinned agent picked later (a chip in a card) swaps in place: the scene doesn't replay
  const [shownAgent, setShownAgent] = useState(agent.full);
  const [isSwapped, setIsSwapped] = useState(false);
  if (shownAgent !== agent.full) {
    setShownAgent(agent.full);
    setIsSwapped(layout.active !== undefined);
  }

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
          <path className={scene.wire} d={layout.trunk} />
          <path className={scene.guide} d={layout.nextWire} />
          {runs > 0 &&
            rows.map((row, index) => (
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

          {rows.map((row, index) => (
            <g key={index} data-tone="pass">
              <g className={scene.rise} style={at(row.arriveAt, row.clearAt)}>
                <rect className={scene.card} {...row.card} />
                <Chip
                  x={row.chip.x}
                  y={row.chip.y}
                  slot={row.tool}
                  tone="soft"
                  fontSize={layout.chip.size}
                  padX={layout.chip.padX}
                />
                <rect
                  className={styles.bar}
                  {...row.bar}
                  rx={row.bar.height / 2}
                />
                <rect
                  className={styles.time}
                  {...row.time}
                  rx={row.time.height / 2}
                />
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

          {/* The next call, still to come */}
          <rect
            className={`${styles.slot} ${scene.fadeIn}`}
            style={at(next.at, 0, 360)}
            {...next.card}
          />
        </g>

        <Block
          sceneId={id}
          projection={layout.projection}
          runs={runs}
          face={hero.face}
          depth={hero.depth}
          isHero
          pressAt={run.press}
        >
          <g
            key={runs}
            className={scene.fadeIn}
            style={at(run.name, 0, run.nameFor)}
          >
            <g key={agent.full} className={isSwapped ? styles.swap : undefined}>
              {logo ? (
                <AgentLogo logo={logo} slot={hero.prompt} />
              ) : (
                <Chip
                  x={hero.prompt.x}
                  y={hero.prompt.y}
                  slot={hero.prompt.slot}
                  tone="solid"
                  fontSize={hero.size}
                  padX={hero.prompt.padX}
                />
              )}
              <text
                className={scene.name}
                x={hero.nameX}
                y={hero.baseline}
                style={{ fontSize: hero.size }}
              >
                <SlotContent slot={agent} />
              </text>
            </g>
          </g>
        </Block>
      </g>
    </Scene>
  );
}
