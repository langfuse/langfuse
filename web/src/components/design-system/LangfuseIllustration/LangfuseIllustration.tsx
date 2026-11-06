import { Suspense, type ComponentType } from "react";
import { SCENE_FRAMES } from "../internal/Illustrations/scenes/frames";
import {
  SCENES,
  type SceneContent,
  type SceneProps,
  type SceneVariant,
} from "../internal/Illustrations/scenes/registry";

type LangfuseIllustrationProps = {
  /** Which product scene to draw. */
  variant:
    | "observability"
    | "evaluation"
    | "prompt"
    | "playground"
    | "experiments"
    | "annotation"
    | "metrics"
    | "agents"
    | "halo";
  /** once builds when it scrolls into view; hover replays on every hover; off stays still. */
  motion: "once" | "hover" | "off";
  /** panel is a tinted plate under the scene; grid is lines only; none is transparent. */
  floor: "panel" | "grid" | "none";
  /** highlight paints the raised element in the primary accent. */
  accent: "none" | "highlight";
  /**
   * described is one image named after what it draws, from its content; decorative is hidden from screen readers,
   * for a scene beside text that already says what it shows.
   */
  a11y: "decorative" | "described";
} & VariantContent;

/** Ties `content` to the chosen variant's sample data, merged over its built-in example. */
type VariantContent = {
  [V in SceneVariant]: { variant: V; content?: Partial<SceneContent[V]> };
}[SceneVariant];

/** The scene's frame, empty, while its code loads: the same box, so nothing moves when it arrives. */
function SceneFrame({ variant }: { variant: SceneVariant }) {
  const { width, height } = SCENE_FRAMES[variant];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      focusable="false"
      className="block h-auto w-full"
    />
  );
}

/**
 * One of the Langfuse product scenes (the langfuse.com tool images, animated), filling its parent's width. Each
 * scene's code loads the first time it's drawn.
 */
export function LangfuseIllustration({
  variant,
  content,
  motion,
  floor,
  accent,
  a11y,
}: LangfuseIllustrationProps) {
  const VariantScene = SCENES[variant] as ComponentType<
    SceneProps<SceneVariant>
  >;
  return (
    <Suspense fallback={<SceneFrame variant={variant} />}>
      <VariantScene
        content={content}
        motion={motion}
        floor={floor}
        accent={accent}
        a11y={a11y}
      />
    </Suspense>
  );
}
