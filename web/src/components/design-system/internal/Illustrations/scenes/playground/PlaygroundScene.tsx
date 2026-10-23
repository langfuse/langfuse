"use client";

import { Block } from "../../engine/Block";
import { play } from "../../engine/keyframes";
import { at } from "../../engine/motion";
import { planTransform } from "../../engine/projection";
import { Scene } from "../../engine/Scene";
import scene from "../../engine/Scene.module.css";
import { SlotContent } from "../../engine/SlotContent";
import { TypeOut } from "../../engine/TypeOut";
import { useScene } from "../../engine/useScene";
import type { SceneProps } from "../registry";
import { PLAYGROUND_DEFAULTS } from "./content";
import { layoutPlayground } from "./layout";
import styles from "./playground.module.css";

/** A prompt goes to two models side by side; each run types out the next model's reply. */
export function PlaygroundScene({
  content,
  motion,
  floor,
  accent,
  a11y,
}: SceneProps<"playground">) {
  const { id, layout, playback, lift } = useScene(
    PLAYGROUND_DEFAULTS,
    content,
    layoutPlayground,
    motion,
  );
  const { runs } = playback;
  const { messages, models, reply, run, modelText } = layout;
  const active = runs === 0 ? 0 : (runs - 1) % Math.max(1, models.length);
  const shown = models[active];

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
        {messages.map((message, index) => (
          <g
            key={index}
            className={scene.fadeIn}
            style={at(index === 0 ? run.system : run.user)}
          >
            <rect className={scene.card} {...message.card} />
            <text
              className={scene.label}
              x={message.textX}
              y={message.baseline}
              style={{ fontSize: layout.messageFont }}
            >
              <SlotContent slot={message.slot} />
            </text>
          </g>
        ))}

        <path
          className={`${scene.wire} ${scene.flash}`}
          style={at(run.fork)}
          d={layout.fork}
        />
        {runs > 0 &&
          layout.forkPackets.map((packet, index) => (
            <rect
              key={index}
              className={scene.packet}
              x={-2.5}
              y={-2.5}
              width={5}
              height={5}
              style={play(packet, run.fork)}
            />
          ))}

        {models.map((model, index) => (
          <path
            key={index}
            className={styles.lead}
            d={`M${model.wireX} ${model.face.y + model.face.height}V${reply.top}`}
          />
        ))}
        {runs > 0 &&
          models.map((model, index) => (
            <rect
              key={index}
              className={scene.packet}
              x={-2.5}
              y={-2.5}
              width={5}
              height={5}
              style={play(model.down, model.downAt)}
            />
          ))}

        {shown?.lines.map((line, index) => {
          const startsAt = shown.replyAt + index * shown.lineStagger;
          return (
            <g key={index} style={{ opacity: reply.fade[index] ?? 0.1 }}>
              <text
                className={`${scene.label} ${scene.fadeIn}`}
                style={{ ...at(startsAt, 0, 200), fontSize: reply.fontSize }}
                x={reply.x}
                y={reply.baseline + index * reply.pitch}
              >
                <TypeOut
                  playback={playback}
                  text={line.text}
                  at={startsAt}
                  perChar={shown.perChar}
                />
              </text>
            </g>
          );
        })}
      </g>

      {/* Back to front: the first model sits nearest the viewer */}
      {models
        .map((model, index) => (
          <Block
            key={index}
            sceneId={id}
            projection={layout.projection}
            runs={runs}
            face={model.face}
            depth={modelText.depth}
            isHero={index === active}
            pressAt={model.pressAt}
            landAt={index * run.landStep}
          >
            <text
              className={scene.name}
              x={model.face.x + model.face.width / 2}
              y={model.face.y + modelText.baseline}
              textAnchor="middle"
              style={{ fontSize: modelText.fontSize }}
            >
              <SlotContent slot={model.name} />
            </text>
          </Block>
        ))
        .reverse()}
    </Scene>
  );
}
