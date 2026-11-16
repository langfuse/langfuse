import { cva } from "class-variance-authority";
import { Suspense, type ComponentType } from "react";
import type { Accent, Backdrop } from "../engine/Frame";
import { SCENE_FRAMES } from "../scenes/frames";
import {
  SCENES,
  type SceneContent,
  type SceneProps,
  type SceneVariant,
} from "../scenes/registry";

const langfuseIllustrationVariants = cva("w-full", {
  variants: {
    size: { sm: "max-w-xs", md: "max-w-md", lg: "max-w-2xl", fill: null },
  },
});

type LangfuseIllustrationProps = {
  /** Its widest: sm for a card's corner, md beside a block of text, lg as a section's picture; fill takes the parent's width. */
  size: "sm" | "md" | "lg" | "fill";
  /** once builds when it scrolls into view; hover replays on every hover; off stays still. */
  motion: "once" | "hover" | "off";
  /** panel is a tinted plate under the scene; grid is lines only; none is transparent. */
  floor: Backdrop;
  /** highlight paints the raised element in the brand's black (white in dark mode). */
  accent: Accent;
  /**
   * described is one image named after what it draws, from its content; decorative is hidden from screen readers,
   * for a scene beside text that already says what it shows.
   */
  a11y: "decorative" | "described";
} & VariantContent;

/**
 * `variant` picks the product scene; `content` overrides its built-in example. Content is sample data only, never
 * customer data: its text ends up in the scene's aria-label and tooltips.
 */
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
 * One of the Langfuse product scenes (the langfuse.com tool images, animated), as wide as its size allows. Each
 * scene's code loads the first time it's drawn.
 */
export function LangfuseIllustration({
  variant,
  content,
  size,
  motion,
  floor,
  accent,
  a11y,
}: LangfuseIllustrationProps) {
  const VariantScene = SCENES[variant] as ComponentType<
    SceneProps<SceneVariant>
  >;
  return (
    <div className={langfuseIllustrationVariants({ size })}>
      <Suspense fallback={<SceneFrame variant={variant} />}>
        <VariantScene
          content={content}
          motion={motion}
          floor={floor}
          accent={accent}
          a11y={a11y}
        />
      </Suspense>
    </div>
  );
}
