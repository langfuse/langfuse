"use client";

import { Block } from "../../engine/Block";
import { play } from "../../engine/keyframes";
import { at } from "../../engine/motion";
import { planTransform } from "../../engine/projection";
import { Scene } from "../../engine/Scene";
import scene from "../../engine/Scene.module.css";
import { SlotContent } from "../../engine/SlotContent";
import { useScene } from "../../engine/useScene";
import type { SceneProps } from "../registry";
import { PROMPT_DEFAULTS } from "./content";
import { layoutPrompt } from "./layout";
import styles from "./prompt.module.css";

/** Versions stack up, the experiment is raised beside them, and the deployment label is wired to both. */
export function PromptScene({
  content,
  motion,
  floor,
  accent,
  a11y,
}: SceneProps<"prompt">) {
  const { id, layout, playback, lift } = useScene(
    PROMPT_DEFAULTS,
    content,
    layoutPrompt,
    motion,
  );
  const { runs } = playback;
  const {
    trunk,
    versions,
    versionText,
    hero,
    tag,
    author,
    sockets,
    deployment,
    run,
  } = layout;
  const plan = planTransform(layout.projection);
  const { x, y, width, height } = deployment.card;
  const arm = deployment.bracket;
  const plate = layout.gridPlate;

  return (
    <Scene
      id={id}
      layout={layout}
      playback={playback}
      lift={lift}
      floor="none"
      accent={accent}
      a11y={a11y}
      defs={
        <>
          <mask
            id={`${id}-dash`}
            maskUnits="userSpaceOnUse"
            x={-400}
            y={-400}
            width={1600}
            height={1600}
          >
            <path
              key={runs}
              className={`${styles.dashReveal} ${scene.draw}`}
              style={at(run.dashAt, 0, run.dashFor)}
              pathLength={1}
              d={layout.dash}
            />
          </mask>
          <filter
            id={`${id}-soften`}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation={plate.soften} />
          </filter>
          <mask
            id={`${id}-plate`}
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={layout.viewBox.width}
            height={layout.viewBox.height}
          >
            <rect
              transform={plan}
              x={plate.x}
              y={plate.y}
              width={plate.width}
              height={plate.height}
              fill="white"
              filter={`url(#${id}-soften)`}
            />
          </mask>
        </>
      }
    >
      {/* The grid lies on a soft plate instead of the engine's panel and radial fade, so the scene draws its own */}
      {floor !== "none" && (
        <g mask={`url(#${id}-plate)`}>
          <path
            className={scene.grid}
            transform={plan}
            d={layout.floor.gridPath}
          />
        </g>
      )}
      <g key={runs} transform={plan}>
        <path className={scene.wire} d={trunk.path} />
        <path
          className={styles.dash}
          d={layout.dash}
          mask={`url(#${id}-dash)`}
        />

        {versions.map((version, index) => (
          <g key={index} className={styles.drop} style={at(version.at)}>
            <rect className={styles.plateCard} {...version.card} />
            <rect
              className={scene.socket}
              x={trunk.x - 3}
              y={version.card.y - 3}
              width={6}
              height={6}
            />
            <text
              className={`${styles.sans} ${version.live ? scene.ink : scene.label}`}
              x={version.card.x + version.card.width / 2}
              y={version.card.y + versionText.baseline}
              textAnchor="middle"
              style={{ fontSize: versionText.size }}
            >
              <SlotContent slot={version.slot} />
            </text>
          </g>
        ))}

        <path className={styles.liveWire} d={layout.wire} />
        <rect
          className={styles.liveSocket}
          x={sockets.liveOut[0] - 3}
          y={sockets.liveOut[1] - 3}
          width={6}
          height={6}
        />
        <rect
          className={styles.liveSocket}
          x={sockets.block[0] - 3}
          y={sockets.block[1] - 3}
          width={6}
          height={6}
        />

        <g className={scene.slide} style={at(run.authorAt)}>
          <rect className={styles.authorChip} {...author.rect} />
          <text
            className={styles.authorText}
            x={author.textX}
            y={author.baseline}
            style={{ fontSize: author.size }}
          >
            <SlotContent slot={author.slot} />
          </text>
        </g>

        <rect
          className={`${styles.plateCard} ${scene.flash}`}
          style={at(run.flash)}
          x={x}
          y={y}
          width={width}
          height={height}
        />
        <path
          className={styles.bracket}
          d={[
            `M${x + arm} ${y}H${x}V${y + arm}`,
            `M${x + width - arm} ${y}H${x + width}V${y + arm}`,
            `M${x + width} ${y + height - arm}V${y + height}H${x + width - arm}`,
            `M${x + arm} ${y + height}H${x}V${y + height - arm}`,
          ].join("")}
        />
        <text
          className={scene.ink}
          x={deployment.textX}
          y={deployment.baseline}
        >
          <SlotContent slot={deployment.slot} />
        </text>
        <g data-tone="pass">
          <g className={scene.pop} style={at(run.reachesLabel)}>
            <circle
              className={scene.halo}
              cx={deployment.dot[0]}
              cy={deployment.dot[1]}
              r={7.2}
            />
            <circle
              className={scene.toned}
              cx={deployment.dot[0]}
              cy={deployment.dot[1]}
              r={4.6}
            />
          </g>
          <circle
            className={scene.ripple}
            style={at(run.reachesLabel)}
            cx={deployment.dot[0]}
            cy={deployment.dot[1]}
            r={6.6}
          />
        </g>

        {runs > 0 && (
          <>
            <rect
              className={scene.packet}
              x={-2.5}
              y={-2.5}
              width={5}
              height={5}
              style={play(run.toBlock, run.packetAt)}
            />
            <rect
              className={scene.packet}
              x={-2.5}
              y={-2.5}
              width={5}
              height={5}
              style={play(run.toLabel, run.reachesBlock)}
            />
          </>
        )}
      </g>

      <Block
        sceneId={id}
        projection={layout.projection}
        runs={runs}
        face={hero.face}
        depth={hero.depth}
        isHero
        pressAt={run.press}
        hasShadow={false}
      >
        <text
          className={`${scene.name} ${styles.sans}`}
          x={hero.versionX}
          y={hero.baseline}
          style={{ fontSize: hero.size }}
        >
          <SlotContent slot={hero.version} />
        </text>
        <rect className={`${scene.chip} ${styles.heroTag}`} {...tag.rect} />
        <text
          className={`${scene.chipText} ${styles.sans} ${styles.heroTagText}`}
          x={tag.textX}
          y={tag.baseline}
          style={{ fontSize: tag.size }}
        >
          <SlotContent slot={tag.slot} />
        </text>
      </Block>
    </Scene>
  );
}
