"use client";

import { useIllustrationId } from "./Frame";
import { usePlayback, type PlayTrigger } from "./usePlayback";

/** What each motion preset does: when a run plays and whether the hero lifts on hover. */
const SCENE_MOTION = {
  /** Builds once when it scrolls into view. */
  once: { trigger: "inView", lift: "hover" },
  /** Still until hovered; each hover replays it. */
  hover: { trigger: "hover", lift: "hover" },
  off: { trigger: "off", lift: "off" },
} as const satisfies Record<
  string,
  { trigger: PlayTrigger; lift: "hover" | "off" }
>;

export type SceneMotion = keyof typeof SCENE_MOTION;

/** The look every scene takes from LangfuseIllustration. */
export type SceneLook = {
  motion: SceneMotion;
  floor: "panel" | "grid" | "none";
  accent: "none" | "highlight";
  /** described is named by what it draws; decorative is hidden, for art beside text that says the same. */
  a11y: "decorative" | "described";
};

/**
 * A scene's setup: its content merged over the defaults, an instance id, the layout, and playback for the motion
 * preset. A hover during a run (`runDuration` ms) doesn't restart it.
 */
export function useScene<
  Content extends object,
  Layout extends { runDuration: number },
>(
  defaults: Content,
  content: Partial<Content> | undefined,
  layoutOf: (content: Content, id: string) => Layout,
  motion: SceneMotion,
) {
  const id = useIllustrationId();
  const layout = layoutOf({ ...defaults, ...content }, id);
  const { trigger, lift } = SCENE_MOTION[motion];
  const playback = usePlayback(trigger, layout.runDuration);
  return { id, layout, playback, lift };
}
