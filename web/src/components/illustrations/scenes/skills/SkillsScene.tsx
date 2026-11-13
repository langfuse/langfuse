"use client";

import { Block } from "../../engine/Block";
import { Chip } from "../../engine/Chip";
import { at } from "../../engine/motion";
import { Packet } from "../../engine/Packet";
import { planTransform } from "../../engine/projection";
import { Scene } from "../../engine/Scene";
import scene from "../../engine/Scene.module.css";
import { SlotContent } from "../../engine/SlotContent";
import { StatusDot } from "../../engine/StatusDot";
import { useScene } from "../../engine/useScene";
import type { SceneProps } from "../registry";
import { SKILLS_DEFAULTS } from "./content";
import { layoutSkills } from "./layout";
import styles from "./skills.module.css";

/** A skill's new version is deployed: its files land as one version, its label moves to it, and each way it's used picks it up. */
export function SkillsScene({
  content,
  motion,
  floor,
  accent,
  a11y,
}: SceneProps<"skills">) {
  const { id, layout, playback, lift } = useScene(
    SKILLS_DEFAULTS,
    content,
    layoutSkills,
    motion,
  );
  const { runs } = playback;
  const { hero, files, targets, run, offset } = layout;

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
          {runs > 0 &&
            targets.map((target, index) => (
              <Packet
                key={index}
                keyframes={target.packet}
                at={target.departAt}
              />
            ))}

          {targets.map((target, index) => (
            <g key={index} data-tone="pass">
              <rect className={scene.card} {...target.card} />
              <Chip
                x={target.chip.x}
                y={target.chip.y}
                slot={target.via}
                variant="soft"
                fontSize={layout.viaChip.size}
                padX={layout.viaChip.padX}
              />
              <text
                className={scene.label}
                x={target.textX}
                y={target.baseline}
                style={{ fontSize: layout.targetSize }}
              >
                <SlotContent slot={target.path} />
              </text>
              <text
                className={`${scene.ink2} ${scene.fadeIn}`}
                x={target.versionX}
                y={target.baseline}
                textAnchor="end"
                style={{
                  ...at(target.arriveAt, target.clearAt, 200),
                  fontSize: layout.targetSize,
                }}
              >
                <SlotContent slot={hero.version} />
              </text>
              <g
                className={scene.pop}
                style={at(target.arriveAt + run.dot, target.clearAt)}
              >
                <StatusDot x={target.dot.x} y={target.dot.y} />
              </g>
            </g>
          ))}
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
          <Chip
            x={hero.versionChip.x}
            y={hero.versionChip.y}
            slot={hero.version}
            variant="solid"
            fontSize={hero.size}
            padX={hero.versionChip.padX}
          />
          <text
            className={scene.name}
            x={hero.nameX}
            y={hero.baseline}
            style={{ fontSize: hero.size }}
          >
            <SlotContent slot={hero.name} />
          </text>
          {/* Block replays its face each run, so the label pops and the files slide in again */}
          <g className={scene.pop} style={at(hero.tagChip.at)}>
            <Chip
              x={hero.tagChip.x}
              y={hero.tagChip.y}
              slot={hero.tag}
              variant="soft"
              fontSize={hero.tagChip.size}
              padX={hero.tagChip.padX}
            />
          </g>
          {files.map((file, index) => (
            <g
              key={index}
              className={scene.slide}
              style={at(file.at, file.clearAt)}
            >
              <rect className={styles.fileIcon} {...file.icon} rx={1.5} />
              <text
                className={styles.filePath}
                x={file.textX}
                y={file.baseline}
                style={{ fontSize: layout.fileSize }}
              >
                <SlotContent slot={file.path} />
              </text>
            </g>
          ))}
        </Block>
      </g>
    </Scene>
  );
}
